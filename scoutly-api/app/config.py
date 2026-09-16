from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # 应用
    APP_NAME: str = "scoutly-api"
    APP_ENV: str = "development"
    API_KEY: str = "dev-api-key"

    # 数据库
    DATABASE_URL: str = "postgresql+asyncpg://threadscout:threadscout@localhost:5432/threadscout"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Reddit
    REDDIT_CLIENT_ID: Optional[str] = None
    REDDIT_CLIENT_SECRET: Optional[str] = None
    REDDIT_USER_AGENT: str = "scoutly:v0.1 by /u/anonymous"
    REDDIT_USERNAME: Optional[str] = None
    REDDIT_PASSWORD: Optional[str] = None
    REDDIT_AUTH_MODE: str = "anonymous"  # anonymous | oauth
    HTTP_PROXY: Optional[str] = None  # 如 http://127.0.0.1:7897
    REDDIT_COOKIES: Optional[str] = None  # 浏览器登录后的 cookie 字符串

    # DeepSeek LLM
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
    DEEPSEEK_MODEL: str = "deepseek-v4-flash"
    LLM_TEMPERATURE: float = 0.3
    LLM_MAX_TOKENS: int = 2000

    # 扫描
    SCAN_DEFAULT_TIME_FILTER: str = "month"
    SCAN_MAX_QUERIES: int = 30
    SCAN_MAX_CANDIDATES: int = 100
    SCAN_REQUEST_INTERVAL: float = 1.5

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
