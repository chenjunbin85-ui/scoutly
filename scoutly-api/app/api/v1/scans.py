from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID
from app.database import get_db
from app.deps import verify_api_key
from app.schemas.scan import ScanResponse, ScanCreateResponse
from app.services.scan_service import ScanService
from app.services.project_service import ProjectService
from app.workers.scan_tasks import scan_project_task

router = APIRouter(tags=["scans"])


@router.post("/projects/{project_id}/scan", response_model=ScanCreateResponse, status_code=202, dependencies=[Depends(verify_api_key)])
async def trigger_scan(project_id: UUID, db: AsyncSession = Depends(get_db)):
    """触发项目扫描（异步）"""
    # 检查项目存在
    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 创建扫描记录
    scan_service = ScanService(db)
    scan = await scan_service.create_scan(project_id)

    # 触发 Celery 异步任务
    scan_project_task.delay(str(scan.id), str(project_id))

    return ScanCreateResponse(
        scan_id=scan.id,
        status="pending",
        message="Scan started. Poll /scans/{id} for progress.",
    )


@router.get("/scans/{scan_id}", response_model=ScanResponse, dependencies=[Depends(verify_api_key)])
async def get_scan(scan_id: UUID, db: AsyncSession = Depends(get_db)):
    """获取扫描状态和进度"""
    service = ScanService(db)
    scan = await service.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    # 构建响应（含进度）
    progress = service.get_progress(scan)
    return ScanResponse(
        id=scan.id,
        project_id=scan.project_id,
        status=scan.status,
        progress=progress,
        started_at=scan.started_at,
        completed_at=scan.completed_at,
        error_message=scan.error_message,
        created_at=scan.created_at,
    )


@router.get("/projects/{project_id}/scans", response_model=List[ScanResponse], dependencies=[Depends(verify_api_key)])
async def list_project_scans(project_id: UUID, db: AsyncSession = Depends(get_db)):
    """获取项目扫描历史"""
    # 检查项目存在
    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    service = ScanService(db)
    scans = await service.get_project_scans(project_id)

    return [
        ScanResponse(
            id=s.id,
            project_id=s.project_id,
            status=s.status,
            progress=service.get_progress(s),
            started_at=s.started_at,
            completed_at=s.completed_at,
            error_message=s.error_message,
            created_at=s.created_at,
        )
        for s in scans
    ]
