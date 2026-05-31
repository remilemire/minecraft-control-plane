# backend/app/api/__init__.py

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.csrf import verify_csrf

api_router = APIRouter(prefix="/api", tags=["api"], dependencies=[Depends(verify_csrf)])

__all__ = ["api_router"]
