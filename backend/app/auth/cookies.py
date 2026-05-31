# backend/app/auth/cookies.py

from __future__ import annotations

from typing import Any

from fastapi import Response

from app.core.config import settings


def set_cookie(
    response: Response, key: str, value: str, *, httponly: bool = True
) -> None:
    cookie_kwargs: dict[str, Any] = {
        "key": key,
        "value": value,
        "httponly": httponly,
        "secure": not settings.DEBUG,
        "samesite": "lax",
        "path": "/",
    }
    if settings.COOKIE_DOMAIN:
        cookie_kwargs["domain"] = settings.COOKIE_DOMAIN
    response.set_cookie(**cookie_kwargs)


def delete_cookie(response: Response, key: str, *, httponly: bool = True) -> None:
    cookie_kwargs: dict[str, Any] = {
        "key": key,
        "httponly": httponly,
        "samesite": "lax",
        "secure": not settings.DEBUG,
        "path": "/",
    }
    if settings.COOKIE_DOMAIN:
        cookie_kwargs["domain"] = settings.COOKIE_DOMAIN
    response.delete_cookie(**cookie_kwargs)


__all__ = ["set_cookie", "delete_cookie"]
