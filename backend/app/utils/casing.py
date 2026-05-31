# backend/app/utils/casing.py

from __future__ import annotations

import re


def snake_to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def camel_to_snake(name: str) -> str:
    s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


def kebab_to_snake(s: str) -> str:
    return s.replace("-", "_")


__all__ = ["snake_to_camel", "camel_to_snake", "kebab_to_snake"]
