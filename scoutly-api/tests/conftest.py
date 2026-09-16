"""
pytest 配置和共享 fixtures
"""
import os

# 设置测试环境变量（必须在导入 app 之前）
os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://threadscout:threadscout@localhost:5432/threadscout"
os.environ["REDIS_URL"] = "redis://localhost:6379/1"
os.environ["DEEPSEEK_API_KEY"] = "sk-test-key-for-testing-only"
os.environ["REDDIT_AUTH_MODE"] = "anonymous"

import pytest
import pytest_asyncio
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import async_session, engine
from app.models.base import Base
from app.models.project import Project
from app.models.scan import Scan
from app.models.opportunity import Opportunity, ScoreBreakdown


@pytest_asyncio.fixture(autouse=True)
async def mock_celery():
    """Mock Celery 任务，避免连接 Redis"""
    with patch("app.api.v1.scans.scan_project_task") as mock_task:
        mock_task.delay = MagicMock(return_value=None)
        yield


@pytest_asyncio.fixture(autouse=True)
async def clean_database():
    """每个测试前清理数据库所有表"""
    async with async_session() as session:
        await session.execute(ScoreBreakdown.__table__.delete())
        await session.execute(Opportunity.__table__.delete())
        await session.execute(Scan.__table__.delete())
        await session.execute(Project.__table__.delete())
        await session.commit()
    yield


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    """API 测试客户端"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session():
    """数据库会话"""
    async with async_session() as session:
        yield session


@pytest_asyncio.fixture
async def test_project(db_session):
    """创建测试项目"""
    project = Project(
        name="TestProject",
        url="https://test.example.com",
        description="Test project for API testing",
        keywords=["test keyword 1", "test keyword 2"],
        competitors=["Competitor A", "Competitor B"],
        include_subreddits=["testsub1"],
        exclude_subreddits=["testsub2"],
    )
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)
    return project


@pytest_asyncio.fixture
async def test_scan(db_session, test_project):
    """创建测试扫描记录"""
    scan = Scan(
        project_id=test_project.id,
        status="completed",
        queries_generated=10,
        candidates_fetched=50,
        duplicates_removed=10,
        opportunities_scored=40,
        total_to_score=40,
    )
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)
    return scan


@pytest_asyncio.fixture
async def test_opportunity(db_session, test_project, test_scan):
    """创建测试机会"""
    opp = Opportunity(
        scan_id=test_scan.id,
        project_id=test_project.id,
        reddit_post_id="test_post_001",
        title="Best test tool for automated testing?",
        url="https://reddit.com/r/test/comments/001",
        subreddit="test",
        author="testuser",
        selftext="Looking for a tool to automate testing.",
        num_comments=42,
        upvote_ratio=0.85,
        score=88,
        priority="high",
        intent_type="recommendation",
        risk_level="low",
        status="new",
        summary="User is looking for a testing tool.",
        suggested_angle="Explain key features to look for.",
        what_not_to_do="Don't lead with product link.",
        content_opportunity="Best testing tools guide.",
    )
    db_session.add(opp)
    await db_session.commit()
    await db_session.refresh(opp)

    # 创建评分明细
    dimensions = [
        ("buying_intent", 28, 30, "Direct recommendation request"),
        ("product_fit", 18, 20, "Matches core use case"),
        ("search_visibility", 17, 20, "Clear long-tail query"),
        ("timing", 13, 15, "Recent and active"),
        ("reply_feasibility", 12, 15, "Helpful reply fits"),
    ]
    for dim, score, max_score, note in dimensions:
        breakdown = ScoreBreakdown(
            opportunity_id=opp.id,
            dimension=dim,
            score=score,
            max_score=max_score,
            note=note,
        )
        db_session.add(breakdown)
    await db_session.commit()

    return opp
