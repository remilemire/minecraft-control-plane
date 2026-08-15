# Minecraft Control Plane

A self-hosted panel for a private Minecraft server, run on a home Linux box via
Docker Compose.

There is exactly one role: a single **owner** (at most one at all times, enforced
by the database). The owner provisions users by email and can transfer ownership;
every other signed-in user has full access to everything else. A player signs in
with **Google**, and the login only succeeds if their email matches a provisioned
user (the env-configured **bootstrap owner email** may create the very first
account — as the owner — while none exists). The **whitelist** is a list of
standalone **Minecraft profiles** (username → UUID, resolved via Mojang): any user
can add or remove profiles, which whitelists/unwhitelists them on the server over
RCON — applied asynchronously through a transactional outbox. Everyone can view
the whitelist with online status, the registered users, and start/stop/restart
the Minecraft container.

> **Status: active development.** The backend and the SPA dashboard are built —
> features, layering, error handling, auth/session/CSRF, OpenAPI docs, a
> transactional outbox, and a multi-layer test suite — and the production path
> (the backend serving the SPA same-origin behind Caddy TLS) is in place. See
> [Deployment](#deployment) and [Current State](#current-state).

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
  exports (`@minecraft-control-plane/shared/auth`, `/users`, `/errors`, …)

**Tooling**
- Docker Compose (dev stack)
- GNU Make (root task runner over Compose + pnpm)

## Project Structure

```
.
├── compose.yaml              # Shared stack config (db, minecraft, controller, backend)
├── compose.override.yaml     # Dev additions (auto-loaded): bind mounts, frontend
├── compose.prod.yaml         # Prod additions: prod targets, restart policies, caddy
├── caddy/Caddyfile           # Prod TLS termination (ACME) → backend
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
│   │   │   └── features/      # auth, users, sessions, minecraft
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
`SESSION_SECRET`, and (for server control) `MINECRAFT_CONTROLLER_TOKEN`. See
[Environment Variables](#environment-variables).

### 2. Start the stack

```bash
make up        # docker compose up --build -d
make logs      # tail all service logs
make down      # stop
```

This starts five services:

| Service   | Default URL / port                        | Notes |
| --------- | ----------------------------------------- | ----- |
| backend   | http://localhost:8000 (`BACKEND_PORT`)    | `tsx watch`; API under `/api`, docs at `/docs` |
| frontend  | http://localhost:5173 (`FRONTEND_PORT`)   | Vite dev server |
| db        | localhost:5432 (`POSTGRES_PORT`)          | PostgreSQL 18 |
| minecraft | internal only (RCON, `expose: 25565`)     | `itzg/minecraft-server` |
| minecraft-controller | http://127.0.0.1:8001 (`MINECRAFT_CONTROLLER_PORT`, loopback only) | Docker-socket sidecar for server power control; bearer-token auth, backend-only compose network |

The repo is bind-mounted into the backend, frontend, and minecraft-controller
containers, so changes reload live.

### 3. Initialize the database

Migrations run from the **host** via `drizzle-kit` (its config points at
`localhost`, so the `db` service must be up and its port published):

```bash
pnpm --filter @minecraft-control-plane/backend db:generate   # generate SQL from schema changes
pnpm --filter @minecraft-control-plane/backend db:migrate     # apply pending migrations
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
pnpm --filter @minecraft-control-plane/backend test:unit
pnpm --filter @minecraft-control-plane/backend test:integration
pnpm --filter @minecraft-control-plane/backend test:api
```

## Environment Variables

Variables are split across three files. The backend container is given **both** the
root `.env` and `apps/backend/.env` (via `compose.yaml`'s `env_file`).

### Root `.env` (compose + Postgres + RCON)

| Variable                  | Example                | Purpose |
| ------------------------- | ---------------------- | ------- |
| `APP_ENV`                 | `dev`                  | `dev` or `prod`. Picks the compose file set (`make` adds `compose.prod.yaml` under `prod`, else the dev override) and, in the backend, `dev` enables debug mode (`secure` cookies off, `trust proxy` off, `/docs` served). |
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
| `MINECRAFT_VERSION`       | `LATEST`               | Minecraft server version (`itzg/minecraft-server` `VERSION`). |
| `MINECRAFT_TYPE`          | `VANILLA`              | Server type/loader (`itzg/minecraft-server` `TYPE`). |
| `MINECRAFT_DIFFICULTY`    | `HARD`                 | World difficulty (`itzg/minecraft-server` `DIFFICULTY`). |
| `MINECRAFT_MODE`          | `SURVIVAL`             | Game mode (`itzg/minecraft-server` `MODE`). |
| `MINECRAFT_MEMORY`        | `2G`                   | JVM heap size (`itzg/minecraft-server` `MEMORY`). |
| `GOOGLE_CLIENT_ID`        | `xxx.apps.googleusercontent.com` | Google OAuth client id (public — it ships in the SPA bundle). Verifies sign-ins in the backend and is baked into the prod image's frontend build as `VITE_GOOGLE_CLIENT_ID`. |
| `CADDY_SITE_ADDRESS`      | `mc.example.com`       | Prod only: the public hostname of the panel — must match its DNS record and the Google console's authorized JavaScript origin. |
| `MINECRAFT_COMPOSE_PROJECT` | `minecraft-control-plane` | Compose project name (pinned via `name:`); the controller finds the minecraft container by its compose labels. |
| `MINECRAFT_CONTROLLER_PORT` | `8001`               | Loopback-only host port for the controller (dev); a host-run controller also listens on it. |
| `MINECRAFT_CONTROLLER_TOKEN` | *(generate one)*    | Bearer token the backend must present to the controller. Lives only in this file. |

### `apps/backend/.env` (application settings)

| Variable                 | Example                              | Purpose |
| ------------------------ | ------------------------------------ | ------- |
| `SESSION_SECRET`         | `secret`                             | Required by `config/env.ts` but currently unused (sessions store hashed random tokens, no signing). |
| `SESSION_TTL_DAYS`       | `7`                                  | Session lifetime (days). |
| `CSRF_TTL_DAYS`          | `7`                                  | CSRF cookie lifetime (days). |
| `MINECRAFT_CONTROLLER_URL` | `http://localhost:8001`             | Minecraft-controller base URL (host-dev default; compose overrides it to `http://minecraft-controller:8000`). |
| `BOOTSTRAP_OWNER_EMAIL`  | `owner@domain.com`                   | May create the very first account — as the owner — while no owner exists yet. |

### `apps/frontend/.env`

| Variable                | Example                          | Purpose |
| ----------------------- | -------------------------------- | ------- |
| `VITE_GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Google sign-in button (host dev; same client as the root `GOOGLE_CLIENT_ID`, which supplies it for prod builds). |

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

- **Google OAuth, owner-provisioned.** The frontend obtains a Google credential; the
  backend verifies it with `google-auth-library`. If no user exists for that Google
  identity, the first sign-in **claims** the user row whose (normalized) email
  matches — the owner provisions those rows ahead of time. Only the
  `BOOTSTRAP_OWNER_EMAIL` may register while **no owner exists**, creating the very
  first account as the owner.
- **One login failure code.** Every sign-in failure — bad token, unverified email,
  unregistered email — returns the same 401 `AUTHENTICATION_FAILED` with one
  message, so responses can't be used to enumerate which emails have accounts.
- **Sessions:** a random token is set in an httponly `session_token` cookie; only its
  SHA-256 hash is stored in the `sessions` table. Expires after `SESSION_TTL_DAYS`.
- **CSRF:** double-submit — a non-httponly `csrf_token` cookie must match the
  `x-csrf-token` header on unsafe requests (`requireCsrf`).
- **Authorization:** `requireAuth` loads the session's user. The single **owner**
  (at most one, DB-enforced) is the only role: creating users and transferring
  ownership are owner-only (`NOT_OWNER` otherwise); everything else is open to every
  authenticated user. Mutations additionally require the CSRF pair. The owner cannot
  be deleted; ownership must be transferred first (user deletion itself is not built
  yet).

## API

All routes are mounted under `/api`. Current surface:

- `POST /api/auth/google`, `POST /api/auth/logout`
- `GET/POST /api/users`, `GET /api/users/me`,
  `POST /api/users/:userId/transfer-ownership` (the POSTs are owner-only)
- `GET/POST /api/minecraft/profiles`,
  `DELETE /api/minecraft/profiles/:minecraftProfileId`
- `GET /api/minecraft/server/status`,
  `POST /api/minecraft/server/start|stop|restart`

A profile is a standalone whitelist entry addressed by its own
`minecraftProfileId` — profiles are not tied to users. Whitelist commands run
asynchronously via the transactional outbox, moments after the response.

Browse the live, generated spec at `/docs` (dev only — the OpenAPI routes are not
mounted in prod).

## Testing

Vitest, three layers (backend):

- **unit** — colocated `*.test.ts`; no database, external clients faked.
- **integration** — colocated `*.integration.test.ts`; repositories against a real
  per-worker Postgres test database.
- **api** — `test/api/*.api.test.ts`; black-box `supertest` against the full Express
  app with fakes at the external boundaries.

Integration and API tests require the Compose `db` service reachable on
`localhost:5432`.

## Deployment

A single self-hosted Linux machine runs the same Compose stack with `APP_ENV=prod`:
the **backend serves the built SPA same-origin** (no separate web server, no
cross-origin cookies), behind a **Caddy** edge that terminates TLS. The stack is
publicly reachable — players connect to Minecraft from anywhere and users reach the
panel from anywhere — while everything else stays private.

Published ports: **80/443** (Caddy) and **25565** (Minecraft). The database, the
backend (`:8000`), RCON, the docker socket, and the minecraft-controller have no
published ports and are reachable only inside the compose networks.

### Prerequisites

1. **Public DNS**: an A record for the panel hostname (`CADDY_SITE_ADDRESS`)
   pointing at the connection's WAN IP. If the IP is dynamic, set up DDNS (your
   registrar's DDNS endpoint or a small updater — outside this stack).
2. **Router/firewall port forwarding**: TCP **80 + 443** → this machine (Caddy:
   ACME challenges, redirect, panel) and TCP **25565** → this machine (Minecraft).
3. **Google console**: add `https://<CADDY_SITE_ADDRESS>` to the OAuth client's
   **authorized JavaScript origins** (raw IPs are rejected — a real domain is
   required anyway for TLS).

### Running

```bash
# root .env: set APP_ENV=prod, GOOGLE_CLIENT_ID, CADDY_SITE_ADDRESS
make up
```

`make` reads `APP_ENV` from the root `.env` and swaps the dev override for
`compose.prod.yaml` — always drive the prod stack through `make` (bare
`docker compose` would silently auto-load the dev override). On boot the backend
applies pending migrations itself (`drizzle-orm` migrator over `migrations/`), so
there is no separate migrate step; `make migrate` refuses under prod. Caddy obtains
and renews publicly trusted certificates automatically once DNS and the forwards
are live (`make caddy-logs` to watch).

For a local dry-run without DNS, set `CADDY_SITE_ADDRESS=localhost` — Caddy falls
back to its internal CA on its own — and browse `https://localhost` (expect the
self-signed warning; `curl -k`).

### If the connection is CGNAT'd / can't port-forward

If inbound forwarding isn't possible (carrier-grade NAT, ISP policy), the stack
itself is unchanged — route ingress through a relay instead:

- **Recommended**: a cheap VPS with a public IP + a WireGuard tunnel from this
  machine; DNAT TCP 80/443/25565 on the VPS through the tunnel and point DNS at
  the VPS. Caddy's ACME keeps working since real inbound 80/443 exist at the VPS.
  (Client IPs then appear as the tunnel address — cosmetic today.)
- Alternative: Cloudflare Tunnel for the panel plus a TCP tunnel service (e.g.
  playit.gg) for 25565 — no VPS, but split ingress and a third party in the
  panel's TLS path.

A separate **firewall / IP-access layer** in front of the Minecraft server is still
a planned future addition; today, access is controlled through the Minecraft
whitelist over RCON (`ENFORCE_WHITELIST=true`).

## Current State

Implemented:
- pnpm monorepo + Docker Compose dev stack (db, backend, frontend, minecraft)
- Backend features: auth (Google OAuth, owner-provisioned accounts + bootstrap
  owner email), users (single owner role, owner-only provisioning + ownership
  transfer), sessions, Minecraft profiles (the whitelist over RCON, applied via a
  transactional outbox), Minecraft server control (power via docker compose)
- Layered feature architecture with DI, shared Zod schemas, and a shared error catalog
- Centralized error handling + generated OpenAPI docs (Swagger UI, dev only)
- Drizzle schema + migrations; three-layer Vitest suite
- The SPA dashboard: whitelist management, server controls, users (owner badge,
  owner-only provisioning and ownership transfer)
- Production deployment: same-origin SPA from the backend, prod images
  (`pnpm deploy`), Caddy TLS edge, migrate-on-boot ([Deployment](#deployment))

Not yet implemented:
- User deletion (when built, the owner must transfer ownership before deletion)
- The firewall / IP-access layer in front of the Minecraft server

## License

[MIT](LICENSE) © 2026 Remi Lemire
