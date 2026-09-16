import logging
import asyncio
from uuid import UUID
from datetime import datetime, timezone, timedelta
from app.workers.celery_app import celery
from app.database import async_session
from app.models.project import Project
from app.models.scan import Scan
from app.integrations.reddit_client import get_reddit_client, generate_queries, RedditPost
from app.integrations.llm_client import llm_client
from app.services.opportunity_service import OpportunityService
from app.config import settings

logger = logging.getLogger(__name__)


def run_async(coro):
    """在 Celery 同步上下文中运行异步代码"""
    # 用 asyncio.run 代替手动创建循环，避免模块级 engine 绑定旧循环的问题
    return asyncio.run(coro)


@celery.task(bind=True, name="scan_project")
def scan_project_task(self, scan_id: str, project_id: str):
    """扫描项目的主任务：粗筛 → 精评 → 入库"""
    scan_uuid = UUID(scan_id)
    project_uuid = UUID(project_id)

    try:
        run_async(_run_scan(scan_uuid, project_uuid, self))
    except Exception as e:
        logger.error(f"Scan task failed: {e}", exc_info=True)
        run_async(_mark_scan_failed(scan_uuid, str(e)))


async def _run_scan(scan_id: UUID, project_id: UUID, task):
    """执行扫描的异步主逻辑"""
    async with async_session() as db:
        # 1. 加载项目和扫描
        project = await db.get(Project, project_id)
        if not project:
            await _update_scan(db, scan_id, status="failed", error_message="Project not found")
            return

        scan = await db.get(Scan, scan_id)
        if not scan:
            return

        # 标记为 running
        scan.status = "running"
        scan.started_at = datetime.now(timezone.utc)
        await db.commit()

        reddit_client = get_reddit_client()
        opp_service = OpportunityService(db)

        # 2. 生成检索 query
        queries = generate_queries(
            keywords=project.keywords or [],
            competitors=project.competitors or [],
            max_queries=settings.SCAN_MAX_QUERIES,
        )
        scan.queries_generated = len(queries)
        await db.commit()

        # 3. 粗筛：拉取候选帖子
        all_posts = {}  # reddit_post_id -> RedditPost（自动去重）
        total_fetched = 0

        for i, query in enumerate(queries):
            try:
                posts = await reddit_client.search(
                    query=query,
                    subreddit="all",
                    sort="relevance",
                    time_filter=settings.SCAN_DEFAULT_TIME_FILTER,
                    limit=settings.SCAN_MAX_CANDIDATES,
                )
                total_fetched += len(posts)
                for post in posts:
                    if post.id and post.id not in all_posts:
                        all_posts[post.id] = post
            except Exception as e:
                logger.warning(f"Search failed for query '{query}': {e}")
                continue

            # 更新进度
            scan.candidates_fetched = total_fetched
            scan.duplicates_removed = total_fetched - len(all_posts)
            await db.commit()

        # 补充拉取高价值 subreddit 的新帖
        high_value_subs = ["SaaS", "startups", "Entrepreneur", "smallbusiness"]
        for sub in high_value_subs[:3]:
            try:
                posts = await reddit_client.get_subreddit_new(sub, limit=50)
                total_fetched += len(posts)
                for post in posts:
                    if post.id and post.id not in all_posts:
                        all_posts[post.id] = post
            except Exception as e:
                logger.warning(f"Failed to fetch r/{sub}: {e}")

        scan.candidates_fetched = total_fetched
        scan.duplicates_removed = total_fetched - len(all_posts)

        # 4. 规则粗筛：过滤明显不相关的
        candidates = []
        keywords_lower = [kw.lower() for kw in (project.keywords or [])]
        exclude_subs = [s.lower() for s in (project.exclude_subreddits or [])]

        for post in all_posts.values():
            # 排除指定 subreddit
            if post.subreddit.lower() in exclude_subs:
                continue

            # 关键词匹配（标题或正文）
            text = f"{post.title} {post.selftext}".lower()
            if not any(kw in text for kw in keywords_lower):
                continue

            # 排除纯图片/视频帖（无正文且标题无疑问词）
            question_words = ["?", "what", "how", "best", "vs", "alternative", "recommend", "looking", "any"]
            has_text = len(post.selftext) > 50
            has_question = any(w in post.title.lower() for w in question_words)
            if not has_text and not has_question:
                continue

            candidates.append(post)

        scan.total_to_score = len(candidates)
        await db.commit()

        logger.info(f"Coarse filter: {len(all_posts)} -> {len(candidates)} candidates")

        # 5. 精评：LLM 逐条评分
        product_info = {
            "name": project.name,
            "description": project.description or "",
            "keywords": project.keywords or [],
            "competitors": project.competitors or [],
        }

        scored_count = 0
        for i, post in enumerate(candidates):
            try:
                # 获取热门评论（增加上下文）
                top_comments = []
                if post.subreddit and post.id:
                    try:
                        top_comments = await reddit_client.get_post_comments(
                            post.subreddit, post.id, limit=3
                        )
                    except Exception:
                        pass

                post_dict = post.to_dict()
                post_dict["top_comments"] = top_comments

                # LLM 评分
                llm_result = await llm_client.score_post(product_info, post_dict)

                if llm_result:
                    await opp_service.create_opportunity(
                        scan_id=scan_id,
                        project_id=project_id,
                        post_data=post_dict,
                        llm_result=llm_result,
                    )
                    scored_count += 1

            except Exception as e:
                logger.error(f"Failed to score post {post.id}: {e}")
                await db.rollback()  # 重置 session，避免级联失败
                continue

            # 更新进度
            scan.opportunities_scored = scored_count
            if i % 5 == 0:  # 每 5 条提交一次，减少 DB 压力
                await db.commit()

        await db.commit()

        # 6. 完成
        scan.status = "completed"
        scan.completed_at = datetime.now(timezone.utc)
        await db.commit()

        logger.info(f"Scan completed: {scored_count} opportunities created")


async def _update_scan(db, scan_id: UUID, **kwargs):
    scan = await db.get(Scan, scan_id)
    if scan:
        for key, value in kwargs.items():
            if hasattr(scan, key):
                setattr(scan, key, value)
        await db.commit()


async def _mark_scan_failed(scan_id: UUID, error: str):
    async with async_session() as db:
        scan = await db.get(Scan, scan_id)
        if scan:
            scan.status = "failed"
            scan.error_message = error
            scan.completed_at = datetime.now(timezone.utc)
            await db.commit()
