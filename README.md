# minecraft-server

A self-hosted web app for managing access to a private Minecraft server. The intended model: a single admin issues **access keys** and shares them with players; a player redeems a key to register their current IP address as an **access grant**, which a firewall (separate, not part of this repo) would use to allow them through.

> **Status: early development.** This repository currently contains the backend's data and infrastructure layers (models, schemas, services, error handling, auth/session/CSRF helpers, config) and a Docker-based dev environment. There are **no HTTP API routes wired up yet**, the **frontend is an empty skeleton**, **no database migrations have been generated**, and **no tests have been written**. See [Current State](#current-state).

## Tech Stack

**Backend**
- Python 3.13, [uv](https://docs.astral.sh/uv/) for dependency management
- FastAPI
- SQLAlchemy 2.0 (async) with `psycopg` 3
- PostgreSQL 18
- Alembic (async migrations)
- Pydantic / pydantic-settings
- passlib (bcrypt) for password hashing
- Ruff (lint + format), pytest

**Frontend**
- Vue 3 + Vite + TypeScript
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- Pinia, Vue Router
- ESLint (flat config) + Prettier, Vitest

**Tooling**
- Docker Compose (development environment)
- GNU Make (task runner, root + per-app)

## Project Structure

```
.
├── compose.yaml            # Dev stack: db, backend, frontend
├── Makefile                # Root tasks (compose lifecycle, fan-out to apps)
├── .env.example            # Compose-level env (ports, Postgres, APP_ENV)
├── backend/
│   ├── Dockerfile          # multi-stage: base → dev / prod
│   ├── Makefile            # lint/format/test + Alembic wrappers
│   ├── pyproject.toml      # deps + ruff config
│   ├── alembic.ini
│   ├── .env.example        # app settings (secret, CORS, TTLs, admin)
│   ├── migrations/         # Alembic env (no versions generated yet)
│   └── app/
│       ├── main.py         # create_app(): middleware, error handlers, router
│       ├── api/            # APIRouter shell (/api, CSRF dep) — no routes yet
│       ├── core/           # config, db session dependency, lifespan
│       ├── models/         # SQLAlchemy models (Admin, Session, AccessKey, AccessGrant)
│       ├── schemas/        # Pydantic request/response models
│       ├── services/       # Business logic (module-level functions)
│       ├── auth/           # passwords (bcrypt), cookies, CSRF
│       ├── errors/         # Domain exceptions → typed JSON responses
│       └── utils/          # casing, parsing, transaction helpers
└── frontend/
    ├── Dockerfile          # multi-stage: base → dev / builder → nginx (prod)
    ├── Makefile
    ├── vite.config.mts
    ├── .env.example        # BACKEND_ORIGIN
    └── src/                # Vue app (skeleton)
```

## Local Development Setup

The supported way to run the project is the Docker Compose stack.

### Prerequisites
- Docker + Docker Compose
- GNU Make

### 1. Create env files

All `.env` files are gitignored. Copy each example before the first run:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Defaults in the examples work for local development as-is. See [Environment Variables](#environment-variables).

### 2. Start the stack

```bash
make up        # docker compose up -d
make logs      # tail all service logs
make down      # stop
```

This starts three services:

| Service  | Default URL                                    | Notes |
| -------- | ---------------------------------------------- | ----- |
| backend  | http://localhost:8000 (`BACKEND_PORT`)         | uvicorn with `--reload` |
| frontend | http://localhost:5173 (`FRONTEND_PORT`)        | Vite dev server |
| db       | localhost:5432 (`POSTGRES_PORT`)               | PostgreSQL 18 |

Source is bind-mounted into the backend and frontend containers, so changes reload live.

### 3. Initialize the database

No Alembic revisions are committed yet, so the schema does not exist on first boot. Generate the initial revision from the current models, then apply it:

```bash
make -C backend revision MESSAGE=init   # autogenerate from models
make -C backend migrate                 # alembic upgrade head
```

Both commands run Alembic inside the backend container (which can reach the `db` service).

### Other useful commands

```bash
make restart                 # down + up
make reset                   # down -v, rebuild --no-cache, up (drops the DB volume)

make -C backend check        # ruff format, ruff lint --fix, pytest
make -C frontend lint        # eslint --fix
make -C frontend format      # prettier --write
make -C frontend test        # vitest
```

## Environment Variables

Variables are split across three files. The backend container loads **both** the root `.env` and `backend/.env`.

### Root `.env` (compose + Postgres)

| Variable          | Example            | Purpose |
| ----------------- | ------------------ | ------- |
| `APP_ENV`         | `dev`              | `dev` or `prod`. `dev` enables debug mode and required-var validation. |
| `BACKEND_PORT`    | `8000`             | Host port mapped to the backend container. |
| `FRONTEND_PORT`   | `5173`             | Host port mapped to the frontend container. |
| `POSTGRES_PORT`   | `5432`             | Host port mapped to Postgres (see caveat below). |
| `POSTGRES_USER`   | `user`             | Postgres user. |
| `POSTGRES_PASSWORD`| `password`        | Postgres password. |
| `POSTGRES_DB`     | `minecraft_server` | Postgres database name. |

### `backend/.env` (application settings)

| Variable               | Example                   | Purpose |
| ---------------------- | ------------------------- | ------- |
| `SECRET_KEY`           | `secret`                  | Signing key for cookie middleware. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173`   | Comma-separated allowed CORS origins. |
| `COOKIE_DOMAIN`        | *(empty)*                 | Optional cookie domain; empty for host-only cookies. |
| `SESSION_TTL_DAYS`     | `7`                       | Admin session lifetime (days). |
| `ACCESS_KEY_TTL_DAYS`  | `7`                       | Access key lifetime (days). |
| `ACCESS_GRANT_TTL_DAYS`| `30`                      | Access grant lifetime (days). |
| `ADMIN_MINECRAFT_USERNAME` | `admin@company.com`   | The Minecraft username that is granted admin on registration. |

### `frontend/.env`

| Variable         | Example                 | Purpose |
| ---------------- | ----------------------- | ------- |
| `BACKEND_ORIGIN` | `http://localhost:8000` | Backend origin for the frontend. |

> **Caveat:** the backend builds its connection string as `...@db:${POSTGRES_PORT}/...`, but inside the Compose network Postgres listens on `5432`. Keep `POSTGRES_PORT=5432`; changing it breaks the backend's DB connection even though the host mapping changes.

> When `APP_ENV=dev`, the backend validates that `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `SECRET_KEY`, and `ADMIN_MINECRAFT_USERNAME` are set and refuses to start otherwise.

## Database & Migrations

- Models live in `backend/app/models/`. The `Entity` base provides an `id` primary key and a timezone-aware `created_at`; all datetime columns are timezone-aware.
- Alembic is configured for async autogenerate against `models.Base.metadata`.
- Migrations run inside the backend container via Make targets:

```bash
make -C backend revision MESSAGE="describe change"   # autogenerate a revision
make -C backend migrate                              # upgrade head
make -C backend downgrade REV=-1                     # roll back one revision
```

New models must be imported in `backend/app/models/__init__.py` for autogenerate to detect them.

## Backend Architecture

The backend follows a layered structure with deliberate conventions:

- **Models → Schemas → Services → Routes.**
- **Services** are module-level functions (not classes). They mutate the session (`db.add`, attribute updates, queries) but **never commit or flush** — the transaction boundary is the route, which calls the helpers in `utils/transactions.py` (`commit_or_raise` / `flush_or_raise`). Those helpers translate database `IntegrityError`s into typed `ConflictError`s.
- **Schemas** use camelCase on the wire and snake_case in Python (automatic aliasing). Input schemas reject unknown fields; responses are serialized via the schema's `to_response()`.
- **Errors**: code raises domain exceptions from `app.errors`; exception handlers in `errors/handlers.py` map them (and validation/uncaught errors) to a consistent JSON shape `{ type, message, details? }`. These response shapes are also declared in the OpenAPI schema.

## Authentication

The following auth building blocks are **implemented as services/helpers**, but are not yet exposed through any HTTP routes:

- **Single admin.** A registering user is granted admin when their Minecraft username matches `ADMIN_MINECRAFT_USERNAME`.
- **Passwords** are hashed with bcrypt (`app/auth/passwords.py`).
- **Sessions** are cookie-based: a random token is set in an httponly `session_token` cookie, and only its SHA-256 hash is stored in the `sessions` table. Sessions expire after `SESSION_TTL_DAYS`.
- **CSRF** uses the double-submit pattern: a non-httponly `csrf_token` cookie must match an `X-CSRF-Token` header on unsafe requests. `verify_csrf` is registered as a dependency on the `/api` router.
- **Access keys / grants** (services in `app/services/access.py`): keys are stored as SHA-256 hashes; redeeming a key creates a grant bound to the caller's IP address (which the route is expected to pass in from the request).

## API

There are currently **no API endpoints**. `app/api` only defines an `/api` router with the CSRF dependency attached; route modules have not been added yet.

## Testing

`pytest` (backend) and `vitest` (frontend) are configured as dev dependencies, but **no tests exist yet**.

```bash
make -C backend test
make -C frontend test
```

## Deployment (Planned)

> Not implemented. Only the local development stack above is runnable today.

The intended target is a single self-hosted Linux machine running the Compose stack, with the **backend serving the built frontend SPA itself** (same-origin), removing the need for a separate web server and cross-origin cookie configuration. The Dockerfiles already define `prod` build targets (backend: uvicorn without reload; frontend: static build served by nginx), but `compose.yaml` currently builds only the `dev` targets, and same-origin SPA serving from the backend is not yet in place.

## Current State

Implemented:
- Dev environment (Docker Compose: backend, frontend, Postgres) with live reload
- SQLAlchemy models: `Admin`, `Session`, `AccessKey`, `AccessGrant`
- Pydantic schemas and service functions for admins, auth, sessions, and access keys/grants
- Centralized error handling with typed JSON responses and OpenAPI integration
- Session + CSRF + password-hashing infrastructure
- Async Alembic setup and Make-based tooling

Not yet implemented:
- HTTP API routes (the `/api` router has no endpoints)
- Frontend application (`src/App.vue` and `src/main.ts` are empty)
- Database migration versions
- Tests
- Production deployment / serving the SPA from the backend
- The firewall integration that consumes access grants

## License

[MIT](LICENSE) © 2026 Remi Lemire
