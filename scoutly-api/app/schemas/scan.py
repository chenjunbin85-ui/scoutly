from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class ScanProgress(BaseModel):
    queries_generated: int = 0
    candidates_fetched: int = 0
    duplicates_removed: int = 0
    opportunities_scored: int = 0
    total_to_score: int = 0


class ScanResponse(BaseModel):
    id: UUID
    project_id: UUID
    status: str
    progress: ScanProgress
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ScanCreateResponse(BaseModel):
    scan_id: UUID
    status: str
    message: str
