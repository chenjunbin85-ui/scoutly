import logging
from typing import Optional, List
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.scan import Scan
from app.models.project import Project
from app.schemas.scan import ScanProgress

logger = logging.getLogger(__name__)


class ScanService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_scan(self, project_id: UUID) -> Scan:
        """创建扫描记录（状态 pending）"""
        scan = Scan(
            project_id=project_id,
            status="pending",
        )
        self.db.add(scan)
        await self.db.commit()
        await self.db.refresh(scan)
        return scan

    async def get_scan(self, scan_id: UUID) -> Optional[Scan]:
        result = await self.db.execute(
            select(Scan).where(Scan.id == scan_id)
        )
        return result.scalar_one_or_none()

    async def get_project_scans(self, project_id: UUID, limit: int = 20) -> List[Scan]:
        result = await self.db.execute(
            select(Scan).where(Scan.project_id == project_id)
            .order_by(Scan.created_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

    def get_progress(self, scan: Scan) -> ScanProgress:
        """从 scan 记录构建进度对象"""
        return ScanProgress(
            queries_generated=scan.queries_generated or 0,
            candidates_fetched=scan.candidates_fetched or 0,
            duplicates_removed=scan.duplicates_removed or 0,
            opportunities_scored=scan.opportunities_scored or 0,
            total_to_score=scan.total_to_score or 0,
        )

    async def update_scan_status(self, scan_id: UUID, status: str, **kwargs):
        """更新扫描状态和进度字段"""
        scan = await self.get_scan(scan_id)
        if not scan:
            return

        scan.status = status
        for key, value in kwargs.items():
            if hasattr(scan, key):
                setattr(scan, key, value)

        if status == "running" and not scan.started_at:
            scan.started_at = datetime.now(timezone.utc)
        if status in ("completed", "failed"):
            scan.completed_at = datetime.now(timezone.utc)

        await self.db.commit()
