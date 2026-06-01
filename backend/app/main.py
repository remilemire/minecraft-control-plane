# backend/app/main.py

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import settings
from app.core.lifespan import lifespan
from app.errors import init_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan, debug=settings.DEBUG)

    app.add_middleware(SessionMiddleware, settings.SECRET_KEY)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    init_error_handlers(app)

    from app.api import api_router

    app.include_router(api_router)

    return app


app = create_app()

__all__ = ["app"]
