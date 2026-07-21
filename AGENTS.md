# AGENTS.md

Root guide for working in this repo. Keep it high-signal; update it when you discover
stable, reusable, project-specific conventions or constraints. Workspace-specific
detail lives closer to the code:

- Backend: [apps/backend/CLAUDE.md](apps/backend/CLAUDE.md)
- Frontend: [apps/frontend/CLAUDE.md](apps/frontend/CLAUDE.md)

## What this is

A self-hosted admin panel for a personal, **invite-only** Minecraft server, run on a
home Linux box via Docker Compose. There is a **single admin**.

- The admin **invites** players by email. A player signs in with **Google**; login
  only succeeds if their email has a valid, unaccepted invitation (or they already
  have an account).
- Signed-in users link their own **Minecraft player** (username → UUID, resolved via
  Mojang), which self-service adds them to the **whitelist** over **RCON**; only the
  admin can unlink a player (self or anyone else), which removes them again. The
  admin can view the roster (linked players + online status) and all registered
  users, and controls the server via **docker compose** (start/stop/restart the
  container).
- A firewall / IP-access layer in front of the server is a **planned future**
  addition — it does not exist yet. Access is the Minecraft whitelist for now.

## Layout

A single **pnpm** workspace monorepo. TypeScript everywhere (ESM, strict).

```
apps/backend     Express 5 + Drizzle + Postgres API   → apps/backend/CLAUDE.md
apps/frontend    React 19 + Vite SPA                   → apps/frontend/CLAUDE.md
packages/shared  Zod schemas + error catalog (shared by both apps)
```

Top level: `compose.yaml` (dev stack: db, backend, frontend, minecraft), root
`Makefile` (task runner), shared TS/ESLint/Prettier base configs
(`tsconfig.base.json`, `eslint.config.base.ts`, `prettier.config.ts`).

## Commands

Run from the repo root. The `Makefile` wraps Docker Compose and fans pnpm scripts out
across workspaces; scope any workspace target to one package with `pkg=` (e.g.
`make test pkg=backend`).

| Task                                                 | Command                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| Start / stop / restart stack                         | `make up` / `make down` / `make restart`                       |
| Rebuild from scratch                                 | `make nuke`                                                    |
| Apply DB migrations (inside the `backend` container) | `make migrate`                                                 |
| Tail logs                                            | `make logs` (or `logs-backend` / `logs-db` / `logs-minecraft`) |
| Dev servers (all)                                    | `make dev`                                                     |
| Build / test / lint / format                         | `make build` / `test` / `lint` / `format`                      |
| Everything (format+lint+test)                        | `make check`                                                   |
| Install deps                                         | `make install` (`pnpm install --frozen-lockfile`)              |

`make migrate` runs `pnpm db:migrate` via `docker compose exec backend`, so it needs
the stack up (`make up`) and picks up `POSTGRES_HOST=db` from the container's env.
Other single test layers are still pnpm scripts, not Make targets — run them with
`pnpm --filter @minecraft-server/backend <script>` (see the backend guide).

## Environment

Three gitignored `.env` files (each has a committed `.env.example`):

- **root `.env`** — compose-level: ports, Postgres (`POSTGRES_*`), RCON
  (`MINECRAFT_RCON_*`), `APP_ENV` (`dev`|`prod`).
- **`apps/backend/.env`** — app settings: `SESSION_SECRET`, `CORS_ALLOWED_ORIGINS`,
  `*_TTL_DAYS`, `GOOGLE_CLIENT_ID`, `MINECRAFT_COMPOSE_FILE`/`MINECRAFT_SERVICE_NAME`,
  `ADMIN_EMAIL`.
- **`apps/frontend/.env`** — `BACKEND_ORIGIN` (Vite dev-server `/api` proxy target;
  `compose.yaml` overrides it to `http://backend:8000` inside the network) and
  `VITE_GOOGLE_CLIENT_ID` (Google sign-in button; same client as the backend's
  `GOOGLE_CLIENT_ID`).

Gotchas:

- The backend container is given **both** root `.env` and `apps/backend/.env` (via
  `compose.yaml` `env_file`); in Docker the values come from the process env.
- `POSTGRES_HOST=db` inside the Compose network. Tooling that runs on the host
  (`drizzle-kit`, tests) overrides the host to `localhost` and needs the published
  `db` port. Keep `POSTGRES_PORT=5432` — Postgres always listens on 5432 internally.
- `APP_ENV=dev` sets `DEBUG` (in `config/env.ts`): non-secure cookies, `trust proxy`
  off.

## Cross-cutting conventions

- **Wire format is camelCase**, defined once by the Zod schemas in `packages/shared`
  and shared by both apps. Don't hand-build request/response shapes — parse/serialize
  through the shared schemas.
- **Errors are a shared registry.** `packages/shared` defines every error `code` and
  its `kind` (the shared error metadata); the backend maps kinds to HTTP status and
  attaches the human messages (its per-feature error catalog). When you add or change an
  error, update the shared registry first (see the backend guide).
- **Imports never traverse up (`../`); same-directory imports (`./`) are fine.**
  Anything outside the current directory uses the `@/*` path alias (`@/*` → `src/*`
  in both `apps/backend` and `packages/shared`; `apps/backend` additionally has
  `@test/*` → `test/*`). Prefer a directory's barrel (`index.ts`) over reaching into
  its internals when one exists (e.g. `@/db/schema/index.js`, not
  `@/db/schema/users.js`; `@/features/users/index.js` in `packages/shared`, not
  `@/features/users/users.schemas.js` from outside that feature). `tsc` emits `@/`
  verbatim, so both packages' `build` scripts run `tsc-alias` afterward to rewrite
  it to real relative paths in the emitted `dist/`; `packages/shared`'s
  `vitest.config.ts` mirrors the alias so colocated tests resolve it too. It builds
  to `dist/` with `composite: true`; if consumers see stale types, rebuild it
  (`pnpm --filter @minecraft-server/shared build`).
- **Cross-feature access goes service-to-service only.** A feature reaches another
  feature exclusively through that feature's **service** module, and only from its own
  **service** — services are the sole cross-feature boundary. A controller depends on
  its own feature's service and nothing else. Never import another feature's repository
  (or other internals); go through that feature's service.
- **Formatting/linting:** ESLint flat config + Prettier, extended from the root base
  configs. Run `make check` (or `lint`/`format`) before finishing.
- **TS:** strict, ESM, `verbatimModuleSyntax` + `isolatedModules`
  (`import type` for type-only imports; `.js` extensions on relative imports —
  except `apps/frontend`, which uses bundler resolution and no extensions).

## Not built yet — don't assume it exists

- **Admin promotion**: `ADMIN_EMAIL` is read from env but nothing yet sets a user's
  `is_admin`. Treat "who is admin" as unresolved wiring, not an implemented rule.
- **Production**: same-origin SPA serving from the backend, and the firewall /
  IP-access layer.
