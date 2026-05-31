# backend/app/schemas/base.py

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.utils.casing import snake_to_camel


class BaseOut(BaseModel):
    model_config = ConfigDict(alias_generator=snake_to_camel, from_attributes=True)

    def to_response(self):
        return self.model_dump(by_alias=True, exclude_none=True, mode="json")


class BaseIn(BaseModel):
    model_config = ConfigDict(
        alias_generator=snake_to_camel, validate_by_name=True, extra="forbid"
    )

    def to_update(self):
        return self.model_dump(exclude_unset=True)


__all__ = ["BaseOut", "BaseIn"]
