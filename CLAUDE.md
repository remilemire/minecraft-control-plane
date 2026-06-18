# CLAUDE.md

Guide for working in this repo. Keep it high-signal; update it when you discover stable, reusable, project-specific conventions or constraints.

## What this is

Self-hosted admin panel for a personal Minecraft server, run on a home Linux box via Docker Compose. There is a **single admin**. The admin issues **access keys** and shares them with players; a player **redeems** a key, which registers their current IP as an **access grant**. A firewall (not yet built) will use those grants to allow players through. Players have no accounts — they only ever hold a key.

## Stack & layout

- **Backend**: FastAPI + async SQLAlchemy 2.0 (psycopg) + PostgreSQL 18. Python 3.13, managed with **uv**.
- **Frontend**: Vue 3 + Vite + TypeScript + Tailwind v4 + Pinia + Vue Router. Currently a **skeleton** (`App.vue`/`main.ts` are empty).
- **Orchestration**: Docker Compose (dev). Make targets at root and per app.

```
backend/app/
  main.py            create_app(): middleware, error handlers, includes app.api router
  api/               APIRouter shell (prefix /api, CSRF dep). NO ROUTES YET.
  core/              config (pydantic-settings), db (get_db dependency), lifespan (engine/sessionmaker)
  models/            SQLAlchemy models. base.py = Base/Entity; admin, session, access
  schemas/           Pydantic I/O. base.py = BaseIn/BaseOut/EntityOut; types.py = constrained types
  services/          Business logic as module-level functions (no classes)
  auth/              passwords (bcrypt), cookies, csrf
  errors/            Domain exceptions + handlers that map them to a stable JSON shape
  utils/             casing, parsing, transactions (commit_or_raise)
backend/migrations/  Alembic (async). No versions generated yet.
frontend/src/        Vue app (skeleton)
```

## Commands

Run from repo root unless noted. Backend tasks (migrations, lint, test) generally run **inside the container**.

| Task | Command |
| --- | --- |
| Start / stop / rebuild stack | `make up` / `make down` / `make reset` |
| Tail logs | `make logs` (or `make -C backend logs`) |
| Backend lint+format+test | `make -C backend check` (ruff format, ruff check --fix, pytest) |
| Frontend lint/format/test | `make -C frontend lint` / `format` / `test` |
| New migration | `make -C backend revision MESSAGE="..."` (autogenerate, runs in container) |
| Apply migrations | `make -C backend migrate` (`alembic upgrade head`) |
| Roll back | `make -C backend downgrade REV=-1` |
| Install deps | `make -C backend install` (`uv sync`) / `make -C frontend install` (`npm ci`) |

## Environment

Three env files (all gitignored; `.env.example` committed):

- **root `.env`** — compose-level: `APP_ENV` (`dev`|`prod`), `BACKEND_PORT`/`FRONTEND_PORT`/`POSTGRES_PORT`, `POSTGRES_USER`/`PASSWORD`/`DB`.
- **`backend/.env`** — app settings: `SECRET_KEY`, `CORS_ALLOWED_ORIGINS` (comma-separated), `SESSION_TTL_DAYS`, `ACCESS_KEY_TTL_DAYS`, `ACCESS_GRANT_TTL_DAYS`, `ADMIN_MINECRAFT_USERNAME`, `COOKIE_DOMAIN` (being removed — see Deployment).
- **`frontend/.env`** — `BACKEND_ORIGIN`.

The backend container loads both root `.env` and `backend/.env`. `Settings` (`core/config.py`) reads from the process env in Docker. Gotchas:

- `DATABASE_URL` hardcodes host **`db`** (the compose service name) — the backend only reaches Postgres from inside the compose network.
- `REQUIRED_ENV_VARS` are only enforced when `APP_ENV=dev` (`DEBUG`); prod boots with empty defaults.
- `*_TTL_DAYS` ints become `timedelta` via computed properties (`SESSION_TTL`, `ACCESS_KEY_TTL`, `ACCESS_GRANT_TTL`).
- The `env_file=` string in `config.py` is malformed; it doesn't matter under Docker (env comes from the process), but a bare local run won't pick up a dotfile from it.

## Database & migrations

- `Entity` (in `models/base.py`) is the base for tables with an autoincrement `id` + tz-aware `created_at`, and provides `async get_by_id(db, id_)` which **raises `NotFoundError`** when missing. `Session` extends `Base` directly (defines its own `id`/`created_at`).
- **All datetime columns are `DateTime(timezone=True)`.** Always produce values with `datetime.now(UTC)`; never store naive datetimes.
- Alembic is async; `target_metadata = models.Base.metadata`. **Any new model must be imported in `models/__init__.py`** or autogenerate won't see it and relationships won't resolve.
- No migration versions exist yet — the first `revision` will create the initial schema.

## Request flow & layering (read before touching services/routes)

`models → schemas → services → routes`. Strict rules:

- **Services are module-level functions, never classes.** Convention by signature:
  - sync `create`-style fns (e.g. `admins.create`, `access.create_key`) only build the ORM object and `db.add(...)`, then return it — **no flush, no commit**.
  - `async` fns run queries (`select`, `get_by_id`) and may mutate loaded objects.
- **Services NEVER commit or flush.** The transaction boundary is the **route**: a route parses input → calls service(s) → calls `commit_or_raise(db)` → serializes the result. (`flush_or_raise` when you need a generated `id` mid-request — e.g. a freshly-created parent's `id` before inserting a child, since `id` is `None` until flush.)
- `utils/transactions.commit_or_raise` / `flush_or_raise` translate `IntegrityError` → `ConflictError` (by SQLSTATE). ⚠️ Their helper currently doesn't `await` the commit/rollback callbacks — fix that before relying on the commit path.
- Routes serialize via the schema's **`.to_response()`** (camelCase aliases, drops `None`, JSON mode). Don't hand-build dicts.

## Errors

Raise domain exceptions from `app.errors` (`NotFoundError`, `ForbiddenError`, `ConflictError`, `UnauthenticatedError`, `BadRequestError`, `UnprocessableError`, `ServerError`). **Never construct HTTP responses by hand.** Handlers in `errors/handlers.py` map every domain/validation/uncaught error to a stable JSON shape `{ type, message, details? }`; Pydantic validation errors are auto-translated to machine codes with camelCased field names. All status codes are already declared in `ERROR_RESPONSES` (OpenAPI). To add an error type, extend the parallel structures together: `domain.py`, `schemas.py`, `types.py`, `messages.py`, `handlers.py`, `openapi.py`.

## Auth, sessions, CSRF, authorization

- **Single admin.** `users.create` sets `is_admin` when `payload.minecraft_username == settings.ADMIN_MINECRAFT_USERNAME`.
- **Hashing**: passwords use **bcrypt** (`app.auth.passwords`). Opaque tokens — session tokens and access keys — use **sha256** (`sessions._hash_token`, `access._hash_key`), not bcrypt. Follow the existing helper for each.
- **Session**: httponly cookie `session_token`; only its sha256 hash is stored in the `sessions` table; TTL = `SESSION_TTL_DAYS`. `sessions.create` is sync and sets the cookie; `clear` deletes the row + cookies.
- **CSRF**: double-submit. Non-httponly cookie `csrf_token` + `X-CSRF-Token` header; `verify_csrf` is a router-level dependency on `api_router` and enforced for unsafe methods (GET/HEAD/OPTIONS exempt). The frontend must copy the cookie value into the header on every mutating request.
- **Authorization model**:
  - **Management endpoints** (access-key create/deactivate, grant revoke, admin CRUD) require a valid admin session — gate them with a dependency built on `sessions.get_admin_by_request`.
  - **Key redemption is public/unauthenticated** — players have only the key.
- `access.redeem_key(db, payload, ip_address)` takes the client IP **as an argument**; the route must extract it from the request. Never trust a client-supplied IP field (the redeem schema intentionally has none).
- Note: `main.py` also adds Starlette's `SessionMiddleware` (signed cookie via `SECRET_KEY`). That's separate from the DB-backed `session_token` auth above — don't conflate them.

## Conventions

- **Wire format is camelCase; Python is snake_case.** `BaseIn`/`BaseOut` auto-alias via `snake_to_camel`. `BaseIn` is strict (`extra="forbid"`, `validate_by_name`). New schemas go in `schemas/<plural>.py`; reuse constrained types from `schemas/types.py` (e.g. `MinecraftUsernameStr`).
- `AdminUpdate` deliberately omits `password` — `admins.update` does naive `setattr` over columns, so editable fields must map 1:1 to columns. Password changes need a dedicated hashing path.
- Resource modules are **plural** (`admins.py`, `access.py`, `sessions.py`) across models/schemas/services.
- Lint/format with **ruff** (isort enabled via `extend-select = ["I"]`). Keep imports sorted.

## Frontend conventions

- TS strict (`@vue/tsconfig` dom + `noUncheckedIndexedAccess`); `@/` → `src/`. Type-check with `vue-tsc`.
- **Tailwind v4** via `@tailwindcss/vite` — there is **no `tailwind.config`**; configure in CSS.
- ESLint flat config + Prettier (`prettier-plugin-tailwindcss` sorts classes). Run `npm run lint` / `format`.
- Build → `frontend/dist` (`emptyOutDir`). State = Pinia, routing = Vue Router (not wired yet).
- No Vite dev proxy is configured; `BACKEND_ORIGIN` exists but isn't consumed yet.

## Deployment

- **Target**: a single old Linux machine via Docker Compose. The **backend will serve the built SPA itself** (same-origin), so there is no separate nginx in the final setup and **`COOKIE_DOMAIN` is being removed** (same-origin cookies don't need it). Serving `frontend/dist` from FastAPI (`StaticFiles`) is **not implemented yet**.
- The Dockerfiles do have `prod` targets (backend = uvicorn without `--reload`; frontend = nginx), but `compose.yaml` only builds/runs the **dev** targets. Treat the nginx prod stage as legacy relative to the same-origin plan above.

## Not built yet — don't assume it exists

Routes under `app/api` (only the CSRF-guarded router shell), Alembic versions, the admin-session dependency, SPA static-serving, the firewall integration, and essentially the entire frontend.

## Editing rules (quick reference)

- Never commit/flush in a service; commit at the **route** via `commit_or_raise`.
- Raise **domain errors**; never craft HTTP responses.
- Register every new model in `models/__init__.py`.
- Use `datetime.now(UTC)`; all datetime columns are tz-aware.
- Serialize responses with the schema's `.to_response()`; don't bypass aliasing.
- bcrypt for passwords, sha256 for opaque tokens — use the existing helpers.
- Generate/apply migrations through the make targets (they run in the container).
