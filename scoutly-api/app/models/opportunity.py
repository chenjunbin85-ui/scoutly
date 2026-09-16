from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.models.base import Base, UUIDMixin, TimestampMixin


class Opportunity(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "opportunities"

    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    reddit_post_id = Column(String(50), unique=True, nullable=False, index=True)
    title = Column(String(500), nullable=False)
    url = Column(String(1000))
    subreddit = Column(String(100), index=True)
    author = Column(String(100))
    selftext = Column(Text)
    num_comments = Column(Integer, default=0)
    upvote_ratio = Column(Float)
    posted_at = Column(DateTime(timezone=True))
    score = Column(Integer, default=0, index=True)
    priority = Column(String(10), default="watch", index=True)  # high/medium/watch
    intent_type = Column(String(30))
    risk_level = Column(String(10), default="low")  # low/medium/high
    status = Column(String(15), default="new", index=True)  # new/reviewing/replied/skipped/watch
    summary = Column(Text)
    suggested_angle = Column(Text)
    what_not_to_do = Column(Text)
    content_opportunity = Column(Text)
    llm_raw_output = Column(JSONB)

    scan = relationship("Scan", back_populates="opportunities")
    project = relationship("Project", back_populates="opportunities")
    score_breakdowns = relationship("ScoreBreakdown", back_populates="opportunity", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_opportunities_project_status_score", "project_id", "status", "score"),
        Index("ix_opportunities_project_priority", "project_id", "priority"),
    )


class ScoreBreakdown(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "opportunity_score_breakdowns"

    opportunity_id = Column(UUID(as_uuid=True), ForeignKey("opportunities.id"), nullable=False, index=True)
    dimension = Column(String(30), nullable=False)  # buying_intent/product_fit/search_visibility/timing/reply_feasibility
    score = Column(Integer, default=0)
    max_score = Column(Integer, default=0)
    note = Column(Text)

    opportunity = relationship("Opportunity", back_populates="score_breakdowns")
