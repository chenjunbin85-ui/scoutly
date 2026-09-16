from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base, UUIDMixin, TimestampMixin


class Scan(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "scans"

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    status = Column(String(20), default="pending", index=True)  # pending/running/completed/failed
    queries_generated = Column(Integer, default=0)
    candidates_fetched = Column(Integer, default=0)
    duplicates_removed = Column(Integer, default=0)
    opportunities_scored = Column(Integer, default=0)
    total_to_score = Column(Integer, default=0)
    error_message = Column(Text)
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))

    project = relationship("Project", back_populates="scans")
    opportunities = relationship("Opportunity", back_populates="scan", cascade="all, delete-orphan")
