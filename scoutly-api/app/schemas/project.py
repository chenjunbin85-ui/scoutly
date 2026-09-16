from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class ProjectBase(BaseModel):
    name: str = Field(..., max_length=100)
    url: Optional[str] = None
    description: Optional[str] = None
    keywords: List[str] = Field(default_factory=list)
    competitors: List[str] = Field(default_factory=list)
    include_subreddits: List[str] = Field(default_factory=list)
    exclude_subreddits: List[str] = Field(default_factory=list)


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[List[str]] = None
    competitors: Optional[List[str]] = None
    include_subreddits: Optional[List[str]] = None
    exclude_subreddits: Optional[List[str]] = None


class ProjectResponse(ProjectBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectListItem(BaseModel):
    id: UUID
    name: str
    url: Optional[str]
    description: Optional[str]
    created_at: datetime
    total_opportunities: int = 0
    high_priority_count: int = 0
    last_scan_status: Optional[str] = None
    last_scan_at: Optional[datetime] = None

    class Config:
        from_attributes = True
