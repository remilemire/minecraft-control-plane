# CLAUDE.md — backend

Express 5 + Drizzle ORM + PostgreSQL API. Read the [root guide](../../CLAUDE.md) for
the product model, monorepo layout, env, and commands. This file covers backend
internals. Keep it high-signal and update it when conventions change.

## Feature-first layout

Everything domain-specific lives under `src/features/<feature>/`. A feature is a set
of files by role (not all features have every file):

| File                 | Role                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------- |
| `*.routes.ts`        | Builds an Express `Router`; applies `requireAuth` / `requireAdmin` / `requireCsrf`.    |
| `*.controller.ts`    | Class of request handlers: parse input, call the service, serialize the response.      |
| `*.service.ts`       | Class holding business logic; throws `AppError` on domain failures.                    |
| `*.repository.ts`    | Class of Drizzle queries; executor from `DatabaseProvider`, wrapped in `withDbErrors`. |
| `*.types.ts`         | Internal TS types + boundary interfaces (e.g. `MojangApi`).                            |
| `*.openapi.ts`       | Registers the feature's operations on the OpenAPI registry (import side effect).       |
| `*.error-catalog.ts` | Human-readable messages for this feature's error codes.                                |

Features: `auth` (with `auth/oauth-identities`, `auth/sessions`, `auth/clients/`),
`users`, `invitations`, `minecraft` (with `minecraft/players`, `minecraft/server`,
`minecraft/profiles`, and `minecraft/clients/`). Cross-cutting code sits outside
`features/`: `config/`, `db/`, `errors/`, `http/`, `validation/`, `openapi/`,
`middleware/`, `lib/`, `routes/`.

A sub-feature is a directory under its parent whose files are named for the
**sub-feature alone** (`oauth-identities/oauth-identities.service.ts`) — the parent's
name is not repeated in the filename. A parent reaches into its own sub-feature with
a descending `./sub/...` import; a sub-feature reaches back out (e.g. to the parent's
`*.types.ts`) through the `@/*` alias, never `../`.

A sub-feature owns its own types and error codes: a type or code used only inside
one belongs in that sub-feature's `*.types.ts` / errors module, not the parent's.
The parent's `*.types.ts` keeps what the whole feature shares — including the
external-client seams (`OAuthApi`, `MojangApi`), which stay at parent level rather
than moving into `clients/`.

The parent's `*.error-catalog.ts` **aggregates** its sub-features' catalogs (spread
them alongside its own codes) so `errors/catalog.ts` has one entry per top-level
feature; `auth.error-catalog.ts` and `minecraft.error-catalog.ts` both do this.

Several sub-features are partial exceptions to the file-role layout above — all are
internal-only (`*.service.ts` + `*.repository.ts`, no
`*.routes.ts`/`*.controller.ts`/`*.openapi.ts`), reached only through their service:

- `auth/oauth-identities` owns the `oauth_identities` table (the provider-account →
  user link). `AuthService` depends on `OAuthIdentityService`, never on
  `OAuthIdentityRepository`.
- `auth/sessions` owns the `sessions` table and the token lifecycle, plus the
  `SESSION_NOT_FOUND` / `INVALID_SESSION` codes. `AuthService` is its only consumer.
- `minecraft/profiles` owns the `minecraft_profiles` table (a user's linked
  username/uuid) and adds a `*.error-catalog.ts`; `minecraft/players` is the
  HTTP-facing feature that composes `MinecraftProfileService` with
  `MinecraftServerService` to merge profile data with live online status and drive
  the whitelist.

Path alias: `@/*` → `src/*` (and `@test/*` → `test/*`). Use `.js` extensions on
relative/alias imports (ESM). Imports never use `../`; same-directory `./` imports
are fine, anything else goes through the alias, preferring a barrel (`@/db/schema/index.js`)
over reaching into a directory's internals (`@/db/schema/users.js`) when one exists.

## Layering & dependency injection

`routes → controller → service → repository → db`. Never skip a layer (controllers
don't touch Drizzle; repositories don't format HTTP).

Composition is explicit DI:

- `createApp(deps)` (`app.ts`) mounts middleware, the OpenAPI routes, and
  `createRouter(deps)` under `/api`, then the error handler.
- `createRouter(deps)` (`routes/index.ts`) instantiates every repository → service →
  controller and mounts the feature routers. **This is where wiring lives** — add new
  features here.
- `AppDeps` are the external boundaries: `{ db, googleTokenVerifier, mojangClient,
rconClient, processClient }`, each an **interface**. `server.ts` (the production
  composition root) injects the real clients; tests inject fakes.

To add a dependency on an outside system, define an interface (a "seam"), implement it
as a client (real in `server.ts`, fake in `test/fakes/`), and thread it through
`AppDeps`.

## Request flow

1. Controller calls `parseOrThrow(schema, input)` (`validation/parse.ts`) with a Zod
   schema — usually from `@minecraft-server/shared/<feature>`. On failure it throws a
   `ValidationError` carrying normalized issues. Request-body schemas are `.strict()`
   (unknown fields are a validation error, not silently dropped); response schemas
   are not.
2. Service does the work; failures are `throw new AppError("CODE")`.
3. Repository runs Drizzle queries inside `withDbErrors(() => ..., constraintErrors)`
   (`db/errors.ts`), which unwraps Drizzle's `DrizzleQueryError`/pg `DatabaseError` and,
   if the violated constraint's name is a key in the `constraintErrors` map, rethrows
   the mapped `AppError`; otherwise it rethrows `INTERNAL`. Constraint names are never
   left to Drizzle's auto-generated defaults — every unique/foreign key constraint is
   named explicitly via the constants in `db/constraints.ts`, which schema modules and
   repositories both import, so a rename can't silently desync the two.
4. Controller serializes with the response schema (`schema.parse(entity)`) and sets
   status.

## Errors

One shape out the door: `{ kind, code, message, issues? }`.

- Throw `AppError(code)` for domain failures, `ValidationError(issues)` for bad input.
  Never build HTTP error responses by hand.
- The `errorHandler` middleware (registered last) calls `translateError`
  (`errors/translator.ts`): `ValidationError`/`AppError` → their code; anything else →
  `INTERNAL`.
- The shared **error metadata** (`errorMeta`, `@minecraft-server/shared/errors`,
  aggregated from per-feature maps in `packages/shared/src/features/**/*.errors.ts` —
  sub-features have their own, re-exported through the parent feature's barrel) maps
  each `code` → `kind`; `errors/http-status.ts` maps `kind` → HTTP status. It's also the
  source that derives the `ErrorCode` types and the wire `errorResponseSchema`.
- **Human messages** are the backend **catalog** (`errorCatalog`): per-feature
  `src/features/**/*.error-catalog.ts`, with each parent feature aggregating its
  sub-features' catalogs, all aggregated in `errors/catalog.ts`.

To add an error code, update three places that must stay in sync:

1. the feature's metadata in `packages/shared` (adds `code` + `kind`),
2. the feature's `*.error-catalog.ts` (message),
3. optionally its `*.openapi.ts` if a route should advertise the new status.

## Auth, sessions, CSRF, authorization

- **OAuth, invite-only, provider-agnostic.** `AuthService.authenticateWithOAuth` picks
  the caller's provider (today just `google`) from its `OAuthClients` registry, verifies
  the credential via that client, then looks up `oauth_identities` by
  `(provider, providerSubject)` (`OAuthIdentityService.findBySubjectWithUser`). Found
  → that user. Not found → `registerInvited`: the admin check
  (`email === env.ADMIN_EMAIL`) and, for non-admins, the
  `InvitationService.findPending(email)` lookup (else `NOT_INVITED`) run **before**
  the transaction; inside it (`TransactionManager.run`), the user is created (or
  `bootstrapAdmin`'d), its first `oauth_identities` row is inserted, and the
  invitation is marked accepted by that user — one unit of work. Session creation
  happens after, outside the transaction.
- **Sessions:** opaque random token in an httponly `session_token` cookie; only its
  **sha256 hash** (`lib/tokens.ts`) is stored in the `sessions` table. Cookie helpers
  in `http/session/`, base cookie options in `config/cookies.ts`.
- **CSRF:** double-submit. `requireCsrf` (`http/csrf/`) checks the non-httponly
  `csrf_token` cookie against the `x-csrf-token` header; applied to mutating routes.
- **Authorization:** `createRequireAuth(authService)` loads `req.user`/`req.session`
  from the session cookie; `requireAdmin` checks `req.user.isAdmin`. Admin-gated:
  invitations, the user list (`GET /users`), the players roster
  (`GET /minecraft/players`), unlinking a player
  (`DELETE /minecraft/players/:userId`), server power. Linking your own Minecraft
  player (`PUT /minecraft/players/me`) is self-service; unlinking someone (yourself
  included) is admin-only — there's no self-service delete. Note: nothing sets
  `isAdmin=true` yet (`ADMIN_EMAIL` is unwired) — see root guide.

## Database & migrations (Drizzle)

- Schema in `src/db/schema/*.ts`; the drizzle client is `db/client.ts`; the
  `Db`/`Tx`/`DatabaseExecutor` types live in `db/types.ts`.
  Tables use `uuid` PKs (`defaultRandom()`) and `timestamp(..., { withTimezone: true })`.
- **Ambient transactions.** Repositories never hold a db handle: they take
  `DatabaseProvider` (`db/provider.ts`) and resolve their executor **per query** via
  `this.databaseProvider.get()` — never cached in a field. `get()` returns the
  transaction bound to the current async context (`db/transaction/context.ts`,
  AsyncLocalStorage) or falls back to the root client. A service opens a unit of work
  with `TransactionManager.run(operation)` (`db/transaction/`); every repository call
  inside `operation` joins that transaction automatically, with no `tx` threading.
  `run` inside an already-active transaction **joins** it — no savepoints, no nesting.
  Only db infrastructure touches the context; services depend on `TransactionManager`
  alone. Keep external side effects (HTTP, RCON, email) **outside** `run`: resolve
  before, fire after (see `MinecraftPlayerService.setByUserId`).
- **Every schema module must be re-exported from `src/db/schema/index.ts`** — that
  barrel is what the client and `drizzle-kit` see.
- Migrations are SQL under `migrations/`, generated by `drizzle-kit`. Config
  (`drizzle.config.ts`) forces `host=localhost`, so run these from the **host** with
  the `db` service up:
  - `pnpm --filter @minecraft-server/backend db:generate` (from schema diffs)
  - `pnpm --filter @minecraft-server/backend db:migrate`
  - `db:studio` for the Drizzle Studio UI.

## OpenAPI

- Zod-first. Each feature's `*.openapi.ts` calls `openApiRegistry.registerPath(...)`;
  `openapi/openapi.document.ts` imports them all for their side effects, then
  generates the doc. `openapi.routes.ts` serves it at `/openapi.json` and Swagger UI
  at `/docs`.
- **Import-order gotcha:** `openapi/zod-extend.ts` (which calls
  `extendZodWithOpenApi`) **must be the first import of `app.ts`**. Zod v4 copies base
  methods onto schema instances at construction, so `.openapi()` has to exist before
  any schema module is evaluated. Test setup has the same requirement.
- zod-to-openapi treats `.exactOptional()` as required — use `.optional()` in
  openapi-facing schemas.
- **`.openapi()` doesn't mutate** — it returns a new schema instance (so a shared
  schema like `emailSchema` can't be annotated in place and reused by reference).
  To fix a lost format/type on one route's request body, build a one-off variant
  with `baseSchema.extend({ field: innerSchema.openapi({...}) })` at the call site
  (see `invitations.openapi.ts`) rather than annotating the shared schema.

## Testing (Vitest, three projects)

Configured in `vitest.config.ts`:

- **unit** — `src/**/*.test.ts`; no DB, external clients faked. Env from
  `test/setup/setup-env.ts`.
- **integration** — `src/**/*.integration.test.ts`; repositories against a real
  per-worker Postgres database.
- **api** — `test/api/*.api.test.ts`; `supertest` against the full app built by
  `test/helpers/create-test-app.ts` with fakes at every boundary.

Details: DB-backed layers use per-worker databases (created/migrated in
`test/setup/setup-db.ts`, dropped each run by `global-setup.ts`) and need the Compose
`db` on `localhost:5432`. Fakes accumulate call logs across tests — API tests that
assert on `processClient`/`rconClient` calls rebuild the app per test. Helpers and
factories live in `test/helpers/`.

`config/env.ts` parses required env **at import time**, so test setup must set env
before any `src` import (hence the `setup-env.ts` / `zod-extend.ts` ordering).

## Backend gaps (structural)

- **Admin promotion** is unwired: `ADMIN_EMAIL` is validated in `config/env.ts` but
  no code sets `is_admin`.
- **`invitations.invitedByUserId`** is `NOT NULL` but its FK is `ON DELETE SET NULL`
  — deleting the inviting user will violate the not-null constraint instead of
  cleanly nulling it out. Needs a decision (nullable column vs. restrict/no-op the
  delete) rather than a one-line fix, since there's only ever one admin today.
