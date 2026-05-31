# backend/app/utils/parsing.py

from __future__ import annotations


def string_to_bool(s: str) -> bool:
    match s.lower():
        case "t" | "y" | "true" | "yes" | "1":
            return True
        case "f" | "n" | "false" | "no" | "0":
            return False
        case _:
            return False


__all__ = ["string_to_bool"]
