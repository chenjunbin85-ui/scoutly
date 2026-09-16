from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID
from app.database import get_db
from app.deps import verify_api_key
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListItem
from app.services.project_service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=List[ProjectListItem], dependencies=[Depends(verify_api_key)])
async def list_projects(db: AsyncSession = Depends(get_db)):
    """获取项目列表"""
    service = ProjectService(db)
    return await service.list_projects()


@router.post("", response_model=ProjectResponse, status_code=201, dependencies=[Depends(verify_api_key)])
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    """创建项目"""
    service = ProjectService(db)
    return await service.create_project(data)


@router.get("/{project_id}", response_model=ProjectResponse, dependencies=[Depends(verify_api_key)])
async def get_project(project_id: UUID, db: AsyncSession = Depends(get_db)):
    """获取项目详情"""
    service = ProjectService(db)
    project = await service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectResponse, dependencies=[Depends(verify_api_key)])
async def update_project(project_id: UUID, data: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    """更新项目"""
    service = ProjectService(db)
    project = await service.update_project(project_id, data)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=204, dependencies=[Depends(verify_api_key)])
async def delete_project(project_id: UUID, db: AsyncSession = Depends(get_db)):
    """删除项目"""
    service = ProjectService(db)
    deleted = await service.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return None
