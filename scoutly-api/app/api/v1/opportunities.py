from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from uuid import UUID
from app.database import get_db
from app.deps import verify_api_key
from app.schemas.opportunity import (
    OpportunityListItem, OpportunityDetailResponse, OpportunityStatusUpdate,
    OpportunityListResponse, ExportRequest,
)
from app.services.opportunity_service import OpportunityService
from app.services.project_service import ProjectService
from app.services.export_service import ExportService

router = APIRouter(tags=["opportunities"])


@router.get("/projects/{project_id}/opportunities", response_model=OpportunityListResponse, dependencies=[Depends(verify_api_key)])
async def list_opportunities(
    project_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    priority: Optional[str] = None,
    intent_type: Optional[str] = None,
    sort: str = Query("score", pattern="^(score|posted_at|created_at|num_comments)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """获取机会列表（分页、筛选、排序、搜索）"""
    # 检查项目是否存在
    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    service = OpportunityService(db)
    result = await service.list_opportunities(
        project_id=project_id,
        page=page,
        page_size=page_size,
        status=status,
        priority=priority,
        intent_type=intent_type,
        sort=sort,
        order=order,
        search=search,
    )
    return result


@router.get("/opportunities/{opportunity_id}", response_model=OpportunityDetailResponse, dependencies=[Depends(verify_api_key)])
async def get_opportunity(opportunity_id: UUID, db: AsyncSession = Depends(get_db)):
    """获取机会详情（含评分明细）"""
    service = OpportunityService(db)
    opp = await service.get_opportunity(opportunity_id)
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    return opp


@router.patch("/opportunities/{opportunity_id}", response_model=OpportunityDetailResponse, dependencies=[Depends(verify_api_key)])
async def update_opportunity_status(
    opportunity_id: UUID,
    data: OpportunityStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新机会状态"""
    service = OpportunityService(db)
    opp = await service.update_status(opportunity_id, data.status)
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    # 加载评分明细关系，避免 Pydantic 序列化时 MissingGreenlet
    await db.refresh(opp, ["score_breakdowns"])
    return opp


@router.post("/projects/{project_id}/export", dependencies=[Depends(verify_api_key)])
async def export_opportunities(
    project_id: UUID,
    data: ExportRequest,
    db: AsyncSession = Depends(get_db),
):
    """导出机会报告（Markdown 或 CSV）"""
    # 检查项目
    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 获取机会数据
    opp_service = OpportunityService(db)
    opportunities = await opp_service.get_project_opportunities_for_export(
        project_id=project_id,
        range_type=data.range,
        status_filter=data.status_filter,
    )

    # 加载评分明细
    for opp in opportunities:
        await db.refresh(opp, ["score_breakdowns"])

    # 生成导出内容
    if data.format == "markdown":
        content = ExportService.to_markdown(opportunities, project.name)
        media_type = "text/markdown"
        filename = f"threadscout-{project.name}-report.md"
    else:
        content = ExportService.to_csv(opportunities)
        media_type = "text/csv"
        filename = f"threadscout-{project.name}-report.csv"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
