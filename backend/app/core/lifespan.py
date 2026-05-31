# backend/app/core/lifespan.py

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings

if TYPE_CHECKING:
    from fastapi import FastAPI


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db_engine = create_async_engine(settings.DATABASE_URL)
    app.state.db_sessionmaker = async_sessionmaker(
        bind=app.state.db_engine, class_=AsyncSession, expire_on_commit=False
    )
    try:
        yield
    finally:
        await app.state.db_engine.dispose()


__all__ = ["lifespan"]
