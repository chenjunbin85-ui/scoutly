import logging
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.opportunity import Opportunity, ScoreBreakdown
from app.models.project import Project

logger = logging.getLogger(__name__)


class OpportunityService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_opportunities(
        self,
        project_id: UUID,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        intent_type: Optional[str] = None,
        sort: str = "score",
        order: str = "desc",
        search: Optional[str] = None,
    ) -> dict:
        """获取机会列表，支持分页、筛选、排序、搜索"""
        query = select(Opportunity).where(Opportunity.project_id == project_id)

        # 筛选
        if status:
            query = query.where(Opportunity.status == status)
        if priority:
            query = query.where(Opportunity.priority == priority)
        if intent_type:
            query = query.where(Opportunity.intent_type == intent_type)
        if search:
            query = query.where(Opportunity.title.ilike(f"%{search}%"))

        # 总数
        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_query)).scalar() or 0

        # 排序
        sort_column = getattr(Opportunity, sort, Opportunity.score)
        if order == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        # 分页
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await self.db.execute(query)
        items = result.scalars().all()

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    async def get_opportunity(self, opportunity_id: UUID) -> Optional[Opportunity]:
        """获取机会详情，含评分明细"""
        result = await self.db.execute(
            select(Opportunity).where(Opportunity.id == opportunity_id)
        )
        opp = result.scalar_one_or_none()
        if opp:
            # 加载评分明细
            await self.db.refresh(opp, ["score_breakdowns"])
            # 兼容旧数据：如果文本字段为空，用 score breakdown 的 note 填充
            if not opp.summary and opp.score_breakdowns:
                notes = []
                for sb in opp.score_breakdowns:
                    if sb.note and sb.score > 0:
                        notes.append(sb.note)
                if notes:
                    opp.summary = " ".join(notes[:2])
            if not opp.suggested_angle and opp.score_breakdowns:
                for sb in opp.score_breakdowns:
                    if sb.dimension == "reply_feasibility" and sb.note:
                        opp.suggested_angle = sb.note
                        break
            if not opp.what_not_to_do and opp.score_breakdowns:
                for sb in opp.score_breakdowns:
                    if sb.dimension == "reply_feasibility" and sb.note:
                        opp.what_not_to_do = "Avoid direct promotion; focus on helpful advice."
                        break
            if not opp.content_opportunity and opp.score_breakdowns:
                for sb in opp.score_breakdowns:
                    if sb.dimension == "search_visibility" and sb.note:
                        opp.content_opportunity = sb.note
                        break
        return opp

    async def update_status(self, opportunity_id: UUID, status: str) -> Optional[Opportunity]:
        """更新机会状态"""
        opp = await self.get_opportunity(opportunity_id)
        if not opp:
            return None
        opp.status = status
        await self.db.commit()
        await self.db.refresh(opp)
        return opp

    async def create_opportunity(
        self,
        scan_id: UUID,
        project_id: UUID,
        post_data: dict,
        llm_result: dict,
    ) -> Optional[Opportunity]:
        """创建机会记录（含评分明细）"""
        # 检查是否已存在（去重）
        existing = await self.db.execute(
            select(Opportunity).where(Opportunity.reddit_post_id == post_data.get("id"))
        )
        if existing.scalar_one_or_none():
            logger.info(f"Opportunity already exists: {post_data.get('id')}")
            return None

        # 兼容两种结构：scores 在 "scores" 字段下，或直接在顶层
        scores = llm_result.get("scores", {})
        if not scores:
            # 从顶层提取评分维度
            score_dims = ["buying_intent", "product_fit", "search_visibility", "timing", "reply_feasibility"]
            for dim in score_dims:
                if dim in llm_result and isinstance(llm_result[dim], dict):
                    scores[dim] = llm_result[dim]

        # 解析 posted_at（可能是 ISO 字符串或 datetime 对象）
        posted_at = post_data.get("posted_at")
        if isinstance(posted_at, str):
            try:
                posted_at = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                posted_at = None

        opp = Opportunity(
            scan_id=scan_id,
            project_id=project_id,
            reddit_post_id=post_data.get("id", ""),
            title=post_data.get("title", ""),
            url=post_data.get("url", ""),
            subreddit=post_data.get("subreddit", ""),
            author=post_data.get("author", ""),
            selftext=post_data.get("selftext", ""),
            num_comments=post_data.get("num_comments", 0),
            upvote_ratio=post_data.get("upvote_ratio"),
            posted_at=posted_at,
            score=llm_result.get("total_score", 0),
            priority=llm_result.get("priority", "watch"),
            intent_type=llm_result.get("intent_type"),
            risk_level=llm_result.get("risk_level", "low"),
            status="new",
            summary=llm_result.get("summary"),
            suggested_angle=llm_result.get("suggested_angle"),
            what_not_to_do=llm_result.get("what_not_to_do"),
            content_opportunity=llm_result.get("content_opportunity"),
            llm_raw_output=llm_result,
        )
        self.db.add(opp)
        await self.db.flush()  # 获取 opp.id

        # 创建评分明细
        dimension_map = {
            "buying_intent": 30,
            "product_fit": 20,
            "search_visibility": 20,
            "timing": 15,
            "reply_feasibility": 15,
        }
        for dim, max_score in dimension_map.items():
            dim_data = scores.get(dim, {})
            breakdown = ScoreBreakdown(
                opportunity_id=opp.id,
                dimension=dim,
                score=dim_data.get("score", 0),
                max_score=dim_data.get("max", max_score),
                note=dim_data.get("note", ""),
            )
            self.db.add(breakdown)

        await self.db.commit()
        await self.db.refresh(opp)
        logger.info(f"Created opportunity: {opp.title[:50]} (score={opp.score})")
        return opp

    async def get_project_opportunities_for_export(
        self,
        project_id: UUID,
        range_type: str = "all",
        status_filter: Optional[List[str]] = None,
    ) -> List[Opportunity]:
        """获取导出用的机会列表"""
        query = select(Opportunity).where(Opportunity.project_id == project_id)

        if range_type == "high":
            query = query.where(Opportunity.priority == "high")

        if status_filter:
            query = query.where(Opportunity.status.in_(status_filter))

        query = query.order_by(Opportunity.score.desc())
        result = await self.db.execute(query)
        return result.scalars().all()
