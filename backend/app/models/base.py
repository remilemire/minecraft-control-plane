# backend/app/models/base.py

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    __abstract__ = True


__all__ = ["Base"]
