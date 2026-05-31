# ================================
# ------------- Base -------------
# ================================

FROM python:3.13-slim AS base

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN pip install --no-cache-dir uv

RUN uv venv

COPY pyproject.toml uv.lock ./

# ================================
# --------- Development ----------
# ================================

FROM base AS dev

RUN uv sync --frozen --no-install-project
COPY . .
RUN uv sync --frozen

CMD ["uv", "run", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]


# ================================
# ---------- Production ----------
# ================================

FROM base AS prod

RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN uv sync --frozen --no-dev

CMD ["uv", "run", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]