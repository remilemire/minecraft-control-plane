# backend/app/core/config.py

from __future__ import annotations

from typing import Literal

from pydantic import EmailStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env, ./env")

    APP_ENV: Literal["prod", "dev"] = "prod"

    POSTGRES_USER: str = ""
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = ""
    POSTGRES_PORT: str = ""

    CORS_ALLOWED_ORIGINS: str = ""

    SECRET_KEY: str = ""
    COOKIE_DOMAIN: str | None = None
    ADMIN_EMAIL: EmailStr | None = None

    @computed_field
    @property
    def DEBUG(self) -> bool:
        return self.APP_ENV == "dev"

    @computed_field
    @property
    def ALLOWED_ORIGINS(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.CORS_ALLOWED_ORIGINS.split(",")
            if origin.strip()
        ]

    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@db:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"


REQUIRED_ENV_VARS = [
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
    "POSTGRES_PORT",
    "SECRET_KEY",
]


def create_settings() -> Settings:
    settings = Settings()

    if settings.DEBUG:
        missing = [name for name in REQUIRED_ENV_VARS if not getattr(settings, name)]

        if missing:
            raise RuntimeError(f"missing required environment variable: {missing}")

    return settings


settings = create_settings()

__all__ = ["settings", "Settings"]
