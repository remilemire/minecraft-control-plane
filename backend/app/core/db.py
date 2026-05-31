# backend/app/core/db.py

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.db_sessionmaker() as db:
        yield db


__all__ = ["get_db"]
