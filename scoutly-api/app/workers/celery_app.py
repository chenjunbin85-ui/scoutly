from celery import Celery
from app.config import settings

celery = Celery(
    "threadscout",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.scan_tasks"],
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 扫描最多 1 小时
    worker_prefetch_multiplier=1,
)
