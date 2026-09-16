from sqlalchemy import Column, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.models.base import Base, UUIDMixin, TimestampMixin


class Project(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "projects"

    name = Column(String(100), nullable=False)
    url = Column(String(500))
    description = Column(Text)
    keywords = Column(JSONB, default=list)
    competitors = Column(JSONB, default=list)
    include_subreddits = Column(JSONB, default=list)
    exclude_subreddits = Column(JSONB, default=list)

    scans = relationship("Scan", back_populates="project", cascade="all, delete-orphan")
    opportunities = relationship("Opportunity", back_populates="project", cascade="all, delete-orphan")
