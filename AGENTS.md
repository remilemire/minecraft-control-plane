# AGENTS.md

Root guide for working in this repo. Keep it high-signal; update it when you discover
stable, reusable, project-specific conventions or constraints. Workspace-specific
detail lives closer to the code:

- Backend: [apps/backend/CLAUDE.md](apps/backend/CLAUDE.md)
- Frontend: [apps/frontend/CLAUDE.md](apps/frontend/CLAUDE.md)

## What this is

A self-hosted panel for a personal, **private** Minecraft server, run on a
home Linux box via Docker Compose. There is exactly one role: a single **owner**
(`users.is_owner`, at most one at all times — DB-enforced). The owner provisions
users and can transfer ownership; every other signed-in user has full access to
everything else.

- The **owner creates users** by email (`POST /users`, owner-only). A player signs
  in with **Google**; login succeeds only if an identity is already linked or a
  user row with their (normalized) email exists — the first sign-in claims the
  provisioned account by linking the Google identity, stamping
  `users.last_login_at` (null = never signed in; stamped on every login) and
  adopting the Google profile name as `fullName`. The env-configured
  **bootstrap owner email** (`BOOTSTRAP_OWNER_EMAIL`) may create the very first
  account — as the owner — while no owner exists yet. Every login failure is the
  single opaque `AUTHENTICATION_FAILED` 401 (anti-enumeration). Owners cannot be
  deleted; ownership must be transferred first (`POST
  /users/:userId/transfer-ownership`, owner-only).
- The **whitelist** is a list of standalone **Minecraft profiles** (username → UUID,
  resolved via Mojang), decoupled from users and addressed by their own id. Any
  signed-in user adds or removes profiles, which whitelists/unwhitelists them over
  **RCON** — applied asynchronously via the backend's transactional outbox. Everyone
  can view the whitelist (profiles + online status) and all registered users, and
  controls the server (start/stop/restart the container) through the
  **minecraft-controller** sidecar — a small HTTP service that owns the docker
  socket (dockerode) so the backend never touches docker itself. It's reachable
  only from the backend (dedicated compose network + bearer token
  `MINECRAFT_CONTROLLER_TOKEN`, plus a loopback host port for host-run dev).
- A firewall / IP-access layer in front of the server is a **planned future**
  addition — it does not exist yet. Access is the Minecraft whitelist for now.

## Layout

A single **pnpm** workspace monorepo. TypeScript everywhere (ESM, strict).

```
apps/backend               Express 5 + Drizzle + Postgres API   → apps/backend/CLAUDE.md
apps/frontend              React 19 + Vite SPA                   → apps/frontend/CLAUDE.md
apps/minecraft-controller  Dockerode sidecar (server power control over HTTP)
packages/shared            Zod schemas + error catalog (shared by the apps)
```

Top level: three compose files — `compose.yaml` (shared: db, minecraft,
minecraft-controller, backend), `compose.override.yaml` (dev additions,
auto-loaded: bind mounts, dev targets, the frontend service, host publishes) and
`compose.prod.yaml` (prod additions: prod targets, restart policies, the `caddy`
TLS edge) — plus `caddy/Caddyfile`, the root `Makefile` (task runner; picks the
compose file set from `APP_ENV` in the root `.env`, so always drive the stack
through `make`), and shared TS/ESLint/Prettier base configs
(`tsconfig.base.json`, `eslint.config.base.ts`, `prettier.config.ts`).

**Production** (`APP_ENV=prod`): the backend image builds the SPA and serves it
same-origin (`SPA_DIR`), applies migrations on boot (no `make migrate`), and sits
behind Caddy (ACME TLS; publishes 80/443 + minecraft 25565 only). `/docs` and
`/openapi.json` are dev-only. Prod images are flattened prod-only installs via
`pnpm deploy --legacy` — the `files` fields in the deployed packages' package.json
are what carry `dist/` (and the backend's `migrations/`) past `.gitignore`.

## Commands

Run from the repo root. The `Makefile` wraps Docker Compose and fans pnpm scripts out
across workspaces; scope any workspace target to one package with `pkg=` (e.g.
`make test pkg=backend`).

| Task                                                 | Command                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| Start / stop / restart stack                         | `make up` / `make down` / `make restart`                       |
| Rebuild from scratch                                 | `make nuke`                                                    |
| Apply DB migrations (dev; prod migrates on boot)     | `make migrate`                                                 |
| Tail logs                                            | `make logs` (or `backend-logs` / `db-logs` / `minecraft-logs`) |
| Dev servers (all)                                    | `make dev`                                                     |
| Build / test / lint / format                         | `make build` / `test` / `lint` / `format`                      |
| Everything (format+lint+test)                        | `make check`                                                   |
| Install deps                                         | `make install` (`pnpm install --frozen-lockfile`)              |

`make migrate` runs `pnpm db:migrate` via `docker compose exec backend`, so it needs
the stack up (`make up`) and picks up `POSTGRES_HOST=db` from the container's env.
Other single test layers are still pnpm scripts, not Make targets — run them with
`pnpm --filter @minecraft-control-plane/backend <script>` (see the backend guide).

## Environment

Three gitignored `.env` files (each has a committed `.env.example`):

- **root `.env`** — compose-level: ports, Postgres (`POSTGRES_*`), RCON
  (`MINECRAFT_RCON_*`), `APP_ENV` (`dev`|`prod` — picks the compose file set and
  the backend's debug mode), `GOOGLE_CLIENT_ID` (public; read by the backend and
  baked into the prod frontend build as `VITE_GOOGLE_CLIENT_ID`),
  `CADDY_SITE_ADDRESS` (prod: the panel's public hostname), the compose project
  name (`MINECRAFT_COMPOSE_PROJECT` — interpolated into compose's top-level
  `name:` and used by the controller's label-based container lookup), and the
  controller (`MINECRAFT_CONTROLLER_PORT`, `MINECRAFT_CONTROLLER_TOKEN` — the
  token lives **only** here; backend host dev reads it via
  `--env-file-if-exists=../../.env`).
- **`apps/backend/.env`** — app settings: `SESSION_SECRET` (required but currently
  unused), `*_TTL_DAYS`, `MINECRAFT_CONTROLLER_URL` (host-dev default
  `http://localhost:8001`; compose overrides it to
  `http://minecraft-controller:8000`), `BOOTSTRAP_OWNER_EMAIL`.
- **`apps/frontend/.env`** — `VITE_GOOGLE_CLIENT_ID` (Google sign-in button in
  host dev; same client as the root `GOOGLE_CLIENT_ID`, which supplies the prod
  build). `BACKEND_ORIGIN` (the Vite dev-server `/api` proxy target) is not in the
  file — vite.config defaults it to `http://localhost:8000` and the dev override
  injects `http://backend:8000` inside the compose network.

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
  through the shared schemas. Those modules import zod as **`import { z } from "zod"`**,
  never the default `import z from "zod"`: the default binding makes `tsc` emit
  `z.z.core.$strip` into the `.d.ts`, which doesn't resolve outside the package, so
  every `z.infer`'d object type silently degrades to `any` in both apps.
- **Errors are a shared registry.** `packages/shared` defines every error `code` and
  its `kind` (the shared error metadata); the backend maps kinds to HTTP status and
  attaches the human messages (its per-feature error catalog). When you add or change an
  error, update the shared registry first (see the backend guide).
- **Imports never traverse up (`../`); same-directory imports (`./`) are fine.**
  Anything outside the current directory uses the `@/*` path alias (`@/*` → `src/*`
  in both `apps/backend` and `packages/shared`; `apps/backend` additionally has
  `@test/*` → `test/*`). Prefer a directory's barrel (`index.ts`) or a module that
  aggregates a convention over reaching into its internals when one exists (e.g.
  `@/infrastructure/db/schemas.js`, not `@/features/users/users.schema.js`;
  `@/features/users/index.js` in `packages/shared`, not
  `@/features/users/users.schemas.js` from outside that feature). `tsc` emits `@/`
  verbatim, so both packages' `build` scripts run `tsc-alias` afterward to rewrite
  it to real relative paths in the emitted `dist/`; `packages/shared`'s
  `vitest.config.ts` mirrors the alias so colocated tests resolve it too. It builds
  to `dist/` with `composite: true`; if consumers see stale types, rebuild it
  (`pnpm --filter @minecraft-control-plane/shared build`).
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

- **User deletion**: users can only be listed and created; there is no delete
  endpoint or UI action yet. When building it, enforce the rule that **the owner
  cannot be deleted** — ownership must be transferred first.
- **The firewall / IP-access layer** in front of the Minecraft server.
