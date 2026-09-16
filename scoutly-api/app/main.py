from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.v1.projects import router as projects_router
from app.api.v1.scans import router as scans_router
from app.api.v1.opportunities import router as opportunities_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化
    yield
    # 关闭时清理


app = FastAPI(
    title=settings.APP_NAME,
    description="Scoutly Reddit 高意向帖子发现工具 - 后端 API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发环境，生产环境收紧
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 健康检查
@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}


# 注册路由
app.include_router(projects_router, prefix="/api/v1")
app.include_router(scans_router, prefix="/api/v1")
app.include_router(opportunities_router, prefix="/api/v1")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
