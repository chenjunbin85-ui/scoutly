import time
import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Optional
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


class RedditPost:
    """统一的 Reddit 帖子数据结构"""
    def __init__(self, data: dict):
        self.id = data.get("id", "")
        self.title = data.get("title", "")
        self.url = f"https://www.reddit.com{data.get('permalink', '')}" if data.get("permalink") else data.get("url", "")
        self.subreddit = data.get("subreddit", "")
        self.author = data.get("author", "")
        self.selftext = data.get("selftext", "")
        self.num_comments = data.get("num_comments", 0)
        self.upvote_ratio = data.get("upvote_ratio", 0.0)
        self.posted_at = datetime.fromtimestamp(data.get("created_utc", 0), tz=timezone.utc) if data.get("created_utc") else None
        self.permalink = data.get("permalink", "")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "url": self.url,
            "subreddit": self.subreddit,
            "author": self.author,
            "selftext": self.selftext,
            "num_comments": self.num_comments,
            "upvote_ratio": self.upvote_ratio,
            "posted_at": self.posted_at.isoformat() if self.posted_at else None,
            "permalink": self.permalink,
        }


def generate_queries(keywords: List[str], competitors: List[str], max_queries: int = 30) -> List[str]:
    """根据关键词和竞品生成多维度检索 query"""
    queries = set()

    # 基础组合
    templates = [
        "{kw}",
        "{kw} alternative",
        "{kw} vs",
        "best {kw}",
        "{kw} review",
        "{kw} recommendation",
        "what do you use for {kw}",
        "looking for {kw}",
        "any {kw} tool",
        "{kw} tool",
    ]

    for kw in keywords:
        for tpl in templates:
            queries.add(tpl.format(kw=kw))

    # 竞品相关
    for comp in competitors:
        queries.add(f"{comp} alternative")
        queries.add(f"switching from {comp}")
        queries.add(f"{comp} vs")

    # 通用高意图
    for kw in keywords[:5]:
        queries.add(f"recommend {kw}")
        queries.add(f"help with {kw}")

    result = list(queries)[:max_queries]
    logger.info(f"Generated {len(result)} search queries")
    return result


class AnonymousRedditClient:
    """匿名模式：使用 .json 端点，不需要 OAuth（但可能需要登录 cookies）"""

    BASE_URL = "https://www.reddit.com"
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
    }

    def __init__(self):
        self.request_interval = settings.SCAN_REQUEST_INTERVAL
        self._last_request_time = 0
        # 解析 cookies 字符串为字典
        self.cookies = {}
        if settings.REDDIT_COOKIES:
            for pair in settings.REDDIT_COOKIES.split(";"):
                pair = pair.strip()
                if "=" in pair:
                    key, value = pair.split("=", 1)
                    self.cookies[key.strip()] = value.strip()

    async def _throttle(self):
        """请求节流"""
        elapsed = time.time() - self._last_request_time
        if elapsed < self.request_interval:
            await asyncio.sleep(self.request_interval - elapsed)
        self._last_request_time = time.time()

    async def _get(self, url: str, params: dict = None) -> Optional[dict]:
        """发送 GET 请求，带重试"""
        for attempt in range(3):
            try:
                await self._throttle()
                client_kwargs = {"timeout": 30.0, "cookies": self.cookies}
                if settings.HTTP_PROXY:
                    client_kwargs["proxy"] = settings.HTTP_PROXY
                async with httpx.AsyncClient(**client_kwargs) as client:
                    resp = await client.get(url, headers=self.HEADERS, params=params)
                    if resp.status_code == 429:
                        wait = int(resp.headers.get("retry-after", 10))
                        logger.warning(f"Rate limited, waiting {wait}s")
                        await asyncio.sleep(wait)
                        continue
                    resp.raise_for_status()
                    return resp.json()
            except Exception as e:
                logger.warning(f"Request failed (attempt {attempt+1}/3): {e}")
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
        return None

    async def search(self, query: str, subreddit: str = "all", sort: str = "relevance",
                     time_filter: str = "month", limit: int = 100) -> List[RedditPost]:
        """搜索帖子"""
        if subreddit == "all":
            url = f"{self.BASE_URL}/search.json"
        else:
            url = f"{self.BASE_URL}/r/{subreddit}/search.json"

        params = {
            "q": query,
            "sort": sort,
            "t": time_filter,
            "limit": limit,
            "restrict_sr": "on" if subreddit != "all" else "off",
        }

        data = await self._get(url, params)
        if not data:
            return []

        posts = []
        for child in data.get("data", {}).get("children", []):
            post_data = child.get("data", {})
            posts.append(RedditPost(post_data))

        logger.info(f"Search '{query}' in r/{subreddit}: {len(posts)} results")
        return posts

    async def get_subreddit_new(self, subreddit: str, limit: int = 100) -> List[RedditPost]:
        """获取 subreddit 最新帖子"""
        url = f"{self.BASE_URL}/r/{subreddit}/new.json"
        params = {"limit": limit}

        data = await self._get(url, params)
        if not data:
            return []

        posts = []
        for child in data.get("data", {}).get("children", []):
            post_data = child.get("data", {})
            posts.append(RedditPost(post_data))

        return posts

    async def get_post_comments(self, subreddit: str, post_id: str, limit: int = 5) -> List[str]:
        """获取帖子评论（用于评分上下文）"""
        url = f"{self.BASE_URL}/r/{subreddit}/comments/{post_id}.json"
        params = {"limit": limit, "sort": "top"}

        data = await self._get(url, params)
        if not data or not isinstance(data, list) or len(data) < 2:
            return []

        comments = []
        for child in data[1].get("data", {}).get("children", []):
            comment_data = child.get("data", {})
            body = comment_data.get("body", "")
            if body:
                comments.append(body)

        return comments


# 工厂函数：根据配置返回对应客户端
def get_reddit_client():
    if settings.REDDIT_AUTH_MODE == "oauth" and settings.REDDIT_CLIENT_ID:
        # TODO: 实现 PRAW OAuth 客户端
        logger.info("Using OAuth Reddit client (PRAW)")
        return AnonymousRedditClient()  # 临时回退
    else:
        logger.info("Using anonymous Reddit client (.json endpoints)")
        return AnonymousRedditClient()
