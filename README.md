# minecraft-server

A self-hosted panel for a private, **invite-only** Minecraft server, run on a
home Linux box via Docker Compose.

Every signed-in user has **full access** — there are no roles. Users invite players
by email; a player signs in with **Google**, and the login only succeeds if their
email has a valid, unaccepted invitation (the env-configured **bootstrap email** may
always register without one, so the first user can ever sign in). The **whitelist**
is a list of standalone **Minecraft profiles** (username → UUID, resolved via
Mojang): any user can add or remove profiles, which whitelists/unwhitelists them on
the server over RCON — applied asynchronously through a transactional outbox.
Everyone can view the whitelist with online status, the registered users, and
start/stop/restart the Minecraft container.

> **Status: active development.** The backend and the SPA dashboard are built —
> features, layering, error handling, auth/session/CSRF, OpenAPI docs, a
> transactional outbox, and a multi-layer test suite. Production (serving the SPA
> from the backend) is not in place. See [Current State](#current-state).

## Tech Stack

Single **pnpm** workspace monorepo, TypeScript throughout (ESM, strict).

**Backend** (`apps/backend`)
- Node + Express 5
- Drizzle ORM + `node-postgres`, PostgreSQL 18
- Zod 4 for validation
- `google-auth-library` (Google ID-token verification), `@minecraft-js/rcon`
- OpenAPI via `@asteasolutions/zod-to-openapi` + `swagger-ui-express`
- `tsx` (dev), `drizzle-kit` (migrations), Vitest (unit / integration / api)

**Frontend** (`apps/frontend`)
- React 19 + Vite
- Tailwind CSS v4 (via `@tailwindcss/vite`; no config file — configured in CSS)
- React Router
- ESLint (flat config) + Prettier, Vitest

**Shared** (`packages/shared`)
- Zod schemas and a shared error catalog consumed by both apps, exposed as subpath
  exports (`@minecraft-server/shared/auth`, `/users`, `/errors`, …)

**Tooling**
- Docker Compose (dev stack)
- GNU Make (root task runner over Compose + pnpm)

## Project Structure

```
.
├── compose.yaml              # Dev stack: db, backend, frontend, minecraft
├── Makefile                  # Root tasks (compose lifecycle + pnpm fan-out)
├── pnpm-workspace.yaml
├── .env.example              # Compose-level env (ports, Postgres, RCON)
├── apps/
│   ├── backend/              # Express API — see apps/backend/CLAUDE.md
│   │   ├── Dockerfile        # multi-stage: base → dev / builder → prod
│   │   ├── drizzle.config.ts
│   │   ├── migrations/       # drizzle-kit SQL migrations
│   │   ├── src/
│   │   │   ├── app.ts        # createApp(router): HTTP assembly
│   │   │   ├── backend.ts    # createBackend(deps): wiring + app + outbox
│   │   │   ├── server.ts     # composition root (real clients, shutdown)
│   │   │   ├── config/       # env parsing, postgres, cookies
│   │   │   ├── infrastructure/ # db (drizzle, ambient tx) + outbox
│   │   │   ├── errors/       # AppError, translator, error catalog glue
│   │   │   ├── http/         # cookie / csrf / session helpers
│   │   │   ├── middleware/   # error handler
│   │   │   ├── openapi/       # OpenAPI document + swagger routes
│   │   │   ├── validation/    # parseOrThrow + zod-issue normalization
│   │   │   ├── routes/        # createRouter(deps): mounts feature routers
│   │   │   └── features/      # auth, users, sessions, invitations, minecraft
│   │   └── test/             # api tests, fakes, factories, db setup
│   └── frontend/            # React SPA (skeleton) — see apps/frontend/CLAUDE.md
│       ├── Dockerfile
│       ├── vite.config.ts
│       └── src/
└── packages/
    └── shared/              # Zod schemas + error catalog (both apps)
```

## Local Development

The supported way to run the project is the Docker Compose stack.

### Prerequisites
- Docker + Docker Compose
- GNU Make
- Node + pnpm (for running migrations and workspace scripts from the host)

### 1. Create env files

All `.env` files are gitignored. Copy each example before the first run:

```bash
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

Fill in the values that have no working default — notably `GOOGLE_CLIENT_ID`,
`SESSION_SECRET`, and (for server control) `MINECRAFT_COMPOSE_FILE` /
`MINECRAFT_CONTAINER`. See [Environment Variables](#environment-variables).

### 2. Start the stack

```bash
make up        # docker compose up --build -d
make logs      # tail all service logs
make down      # stop
```

This starts four services:

| Service   | Default URL / port                        | Notes |
| --------- | ----------------------------------------- | ----- |
| backend   | http://localhost:8000 (`BACKEND_PORT`)    | `tsx watch`; API under `/api`, docs at `/docs` |
| frontend  | http://localhost:5173 (`FRONTEND_PORT`)   | Vite dev server |
| db        | localhost:5432 (`POSTGRES_PORT`)          | PostgreSQL 18 |
| minecraft | internal only (RCON, `expose: 25565`)     | `itzg/minecraft-server` |

The repo is bind-mounted into the backend and frontend containers, so changes reload
live.

### 3. Initialize the database

Migrations run from the **host** via `drizzle-kit` (its config points at
`localhost`, so the `db` service must be up and its port published):

```bash
pnpm --filter @minecraft-server/backend db:generate   # generate SQL from schema changes
pnpm --filter @minecraft-server/backend db:migrate     # apply pending migrations
```

### Other useful commands

Root `make` targets fan out to every workspace; scope to one with `pkg=`:

```bash
make dev                     # run all dev servers in parallel
make build                   # build all workspaces
make test        pkg=backend # test one workspace
make lint                    # eslint --fix across workspaces
make format                  # prettier --write
make check                   # format + lint + test everything
make restart                 # down + up
make nuke                    # down -v --remove-orphans + rebuild --no-cache
```

Backend test layers can be run individually:

```bash
pnpm --filter @minecraft-server/backend test:unit
pnpm --filter @minecraft-server/backend test:integration
pnpm --filter @minecraft-server/backend test:api
```

## Environment Variables

Variables are split across three files. The backend container is given **both** the
root `.env` and `apps/backend/.env` (via `compose.yaml`'s `env_file`).

### Root `.env` (compose + Postgres + RCON)

| Variable                  | Example                | Purpose |
| ------------------------- | ---------------------- | ------- |
| `APP_ENV`                 | `dev`                  | `dev` or `prod`. `dev` enables debug mode (`secure` cookies off, `trust proxy` off). |
| `BACKEND_PORT`            | `8000`                 | Backend listen port + host mapping. |
| `FRONTEND_PORT`           | `5173`                 | Frontend host port. |
| `POSTGRES_PORT`           | `5432`                 | Postgres port (see caveat). |
| `POSTGRES_USER`           | `user`                 | Postgres user. |
| `POSTGRES_PASSWORD`       | `password`             | Postgres password. |
| `POSTGRES_HOST`           | `db`                   | Postgres host — `db` (the compose service) inside the network. |
| `POSTGRES_DATABASE`       | `minecraft_server`     | Database name. |
| `MINECRAFT_RCON_HOST`     | `minecraft`            | RCON host (the compose service name). |
| `MINECRAFT_RCON_PORT`     | `25575`                | RCON port. |
| `MINECRAFT_RCON_PASSWORD` | `password`             | RCON password (also passed to the minecraft container). |

### `apps/backend/.env` (application settings)

| Variable                 | Example                              | Purpose |
| ------------------------ | ------------------------------------ | ------- |
| `SESSION_SECRET`         | `secret`                             | Secret for session-related signing. |
| `CORS_ALLOWED_ORIGINS`   | `http://localhost:5173`              | Comma-separated allowed origins (parsed into `ALLOWED_ORIGINS`). |
| `COOKIE_DOMAIN`          | *(empty)*                            | Optional cookie domain; empty for host-only cookies. |
| `SESSION_TTL_DAYS`       | `7`                                  | Session lifetime (days). |
| `CSRF_TTL_DAYS`          | `7`                                  | CSRF cookie lifetime (days). |
| `INVITATION_TTL_DAYS`    | `7`                                  | Invitation lifetime (days). |
| `GOOGLE_CLIENT_ID`       | `xxx.apps.googleusercontent.com`     | Google OAuth client ID used to verify sign-in credentials. |
| `MINECRAFT_COMPOSE_FILE` | `/home/you/minecraft-server/compose.yaml` | Compose file the backend shells out to for server power control. |
| `MINECRAFT_CONTAINER` | `minecraft`                          | Compose service name of the Minecraft container. |
| `BOOTSTRAP_EMAIL`        | `owner@domain.com`                   | The one email allowed to register without an invitation (so the first user can sign in). No special powers. |

### `apps/frontend/.env`

| Variable         | Example                 | Purpose |
| ---------------- | ----------------------- | ------- |
| `BACKEND_ORIGIN` | `http://localhost:8000` | Backend origin for the frontend (not consumed yet). |

> **Caveat:** keep `POSTGRES_PORT=5432`. The Postgres container always listens on
> `5432` internally, and the backend connects to `${POSTGRES_HOST}:${POSTGRES_PORT}`
> from inside the Compose network — changing the port breaks that connection even
> though the host mapping changes.

## Architecture (backend)

Feature-first, class-based, with explicit dependency injection. Details live in
[apps/backend/CLAUDE.md](apps/backend/CLAUDE.md). In short:

- **Layering:** `routes → controller → service → repository → db`. Each feature owns
  a folder under `src/features/` with those files plus `*.openapi.ts` and
  `*.error-catalog.ts`.
- **Dependency injection:** `createBackend(deps)` composes `createRouter(deps)` (the
  wired dependency graph + outbox dispatcher) with `createApp(router)` (HTTP
  assembly). The external boundaries (`db`, Google verifier, Mojang / RCON / process
  clients) are interfaces; `server.ts` wires the real ones, tests substitute fakes.
- **Validation & wire format:** Zod schemas from `packages/shared` validate input via
  `parseOrThrow` and shape responses. The wire is camelCase.
- **Errors:** code throws `AppError(code)` / `ValidationError(issues)`; a single
  error-handler middleware translates them to a stable JSON shape
  `{ kind, code, message, issues? }`. Codes come from a shared catalog that maps each
  code to a kind and an HTTP status.
- **OpenAPI:** each feature registers its operations as an import side effect; the
  document is served at `/openapi.json` with Swagger UI at `/docs`.

## Authentication

- **Google OAuth, invite-only.** The frontend obtains a Google credential; the
  backend verifies it with `google-auth-library`. If no user exists for that Google
  identity, one is created **only if** the email has a valid, unaccepted invitation
  (`NOT_INVITED` otherwise). The `BOOTSTRAP_EMAIL` may always register without an
  invitation — that's how the first account is created — but becomes a regular user
  like everyone else.
- **Sessions:** a random token is set in an httponly `session_token` cookie; only its
  SHA-256 hash is stored in the `sessions` table. Expires after `SESSION_TTL_DAYS`.
- **CSRF:** double-submit — a non-httponly `csrf_token` cookie must match the
  `x-csrf-token` header on unsafe requests (`requireCsrf`).
- **Authorization:** `requireAuth` loads the session's user; every authenticated user
  has full access — there are no roles. Mutations additionally require the CSRF pair.

## API

All routes are mounted under `/api`. Current surface:

- `POST /api/auth/google`, `POST /api/auth/logout`
- `GET /api/users`, `GET /api/users/me`
- `GET/POST /api/invitations`, `DELETE /api/invitations/:invitationId`
- `GET/POST /api/minecraft/profiles`,
  `DELETE /api/minecraft/profiles/:minecraftProfileId`
- `GET /api/minecraft/server/status`,
  `POST /api/minecraft/server/start|stop|restart`

A profile is a standalone whitelist entry addressed by its own
`minecraftProfileId` — profiles are not tied to users. Whitelist commands run
asynchronously via the transactional outbox, moments after the response.

Browse the live, generated spec at `/docs`.

## Testing

Vitest, three layers (backend):

- **unit** — colocated `*.test.ts`; no database, external clients faked.
- **integration** — colocated `*.integration.test.ts`; repositories against a real
  per-worker Postgres test database.
- **api** — `test/api/*.api.test.ts`; black-box `supertest` against the full Express
  app with fakes at the external boundaries.

Integration and API tests require the Compose `db` service reachable on
`localhost:5432`.

## Deployment (Planned)

> Not implemented. Only the local development stack above is runnable today.

The intended target is a single self-hosted Linux machine running the Compose stack,
with the **backend serving the built SPA itself** (same-origin), removing the need for
a separate web server and cross-origin cookie configuration. A separate **firewall /
IP-access layer** in front of the Minecraft server is a planned future addition; today,
access is controlled through the Minecraft whitelist over RCON.

## Current State

Implemented:
- pnpm monorepo + Docker Compose dev stack (db, backend, frontend, minecraft)
- Backend features: auth (Google OAuth, invite-only + bootstrap email), users,
  sessions, invitations, Minecraft profiles (the whitelist over RCON, applied via a
  transactional outbox), Minecraft server control (power via docker compose)
- Layered feature architecture with DI, shared Zod schemas, and a shared error catalog
- Centralized error handling + generated OpenAPI docs (Swagger UI)
- Drizzle schema + migrations; three-layer Vitest suite
- The SPA dashboard: whitelist management, server controls, invitations, users

Not yet implemented:
- User deletion (the users table in the UI is read-only for now)
- Production deployment / serving the SPA from the backend
- The firewall / IP-access layer in front of the Minecraft server

## License

[MIT](LICENSE) © 2026 Remi Lemire
