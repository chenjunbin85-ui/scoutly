from fastapi import Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import get_db


async def verify_api_key(x_api_key: str = Header(None)):
    if settings.APP_ENV == "development" and not x_api_key:
        return True
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True


async def get_db_session(db: AsyncSession = Depends(get_db)):
    return db
