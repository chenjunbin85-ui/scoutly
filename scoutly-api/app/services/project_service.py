import logging
from typing import List, Optional
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.project import Project
from app.models.scan import Scan
from app.models.opportunity import Opportunity
from app.schemas.project import ProjectCreate, ProjectUpdate

logger = logging.getLogger(__name__)


class ProjectService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_projects(self) -> List[dict]:
        """获取项目列表，含统计信息"""
        result = await self.db.execute(
            select(Project).order_by(Project.created_at.desc())
        )
        projects = result.scalars().all()

        project_list = []
        for p in projects:
            # 统计机会数
            opp_count = await self.db.execute(
                select(func.count(Opportunity.id)).where(Opportunity.project_id == p.id)
            )
            total = opp_count.scalar() or 0

            high_count = await self.db.execute(
                select(func.count(Opportunity.id)).where(
                    Opportunity.project_id == p.id,
                    Opportunity.priority == "high"
                )
            )
            high = high_count.scalar() or 0

            # 最近一次扫描
            last_scan = await self.db.execute(
                select(Scan).where(Scan.project_id == p.id).order_by(Scan.created_at.desc()).limit(1)
            )
            scan = last_scan.scalar_one_or_none()

            project_list.append({
                "id": p.id,
                "name": p.name,
                "url": p.url,
                "description": p.description,
                "created_at": p.created_at,
                "total_opportunities": total,
                "high_priority_count": high,
                "last_scan_status": scan.status if scan else None,
                "last_scan_at": scan.created_at if scan else None,
            })

        return project_list

    async def get_project(self, project_id: UUID) -> Optional[Project]:
        result = await self.db.execute(
            select(Project).where(Project.id == project_id)
        )
        return result.scalar_one_or_none()

    async def create_project(self, data: ProjectCreate) -> Project:
        project = Project(**data.model_dump())
        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)
        logger.info(f"Created project: {project.name} (id={project.id})")
        return project

    async def update_project(self, project_id: UUID, data: ProjectUpdate) -> Optional[Project]:
        project = await self.get_project(project_id)
        if not project:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(project, key, value)

        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def delete_project(self, project_id: UUID) -> bool:
        project = await self.get_project(project_id)
        if not project:
            return False
        await self.db.delete(project)
        await self.db.commit()
        logger.info(f"Deleted project: {project_id}")
        return True
