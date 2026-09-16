from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class ScoreBreakdownResponse(BaseModel):
    dimension: str
    score: int
    max_score: int
    note: Optional[str] = None

    class Config:
        from_attributes = True


class OpportunityListItem(BaseModel):
    id: UUID
    title: str
    url: Optional[str] = None
    subreddit: Optional[str] = None
    score: int
    priority: str
    intent_type: Optional[str] = None
    risk_level: str
    status: str
    num_comments: int = 0
    posted_at: Optional[datetime] = None
    summary: Optional[str] = None

    class Config:
        from_attributes = True


class OpportunityDetailResponse(BaseModel):
    id: UUID
    scan_id: UUID
    project_id: UUID
    reddit_post_id: str
    title: str
    url: Optional[str] = None
    subreddit: Optional[str] = None
    author: Optional[str] = None
    selftext: Optional[str] = None
    num_comments: int = 0
    upvote_ratio: Optional[float] = None
    posted_at: Optional[datetime] = None
    score: int
    priority: str
    intent_type: Optional[str] = None
    risk_level: str
    status: str
    summary: Optional[str] = None
    suggested_angle: Optional[str] = None
    what_not_to_do: Optional[str] = None
    content_opportunity: Optional[str] = None
    score_breakdowns: List[ScoreBreakdownResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OpportunityStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(new|reviewing|replied|skipped|watch)$")


class OpportunityListResponse(BaseModel):
    items: List[OpportunityListItem]
    total: int
    page: int
    page_size: int


class ExportRequest(BaseModel):
    format: str = Field(default="markdown", pattern="^(markdown|csv)$")
    range: str = Field(default="all", pattern="^(all|high|current_page)$")
    status_filter: Optional[List[str]] = None
