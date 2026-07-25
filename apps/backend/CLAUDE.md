# CLAUDE.md — backend

Express 5 + Drizzle ORM + PostgreSQL API. Read the [root guide](../../CLAUDE.md) for
the product model, monorepo layout, env, and commands. This file covers backend
internals. Keep it high-signal and update it when conventions change.

## Feature-first layout

Everything domain-specific lives under `src/features/<feature>/`. A feature is a set
of files by role (not all features have every file):

| File                 | Role                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------- |
| `*.routes.ts`        | Builds an Express `Router`; applies `requireAuth` / `requireCsrf`.                     |
| `*.controller.ts`    | Class of request handlers: parse input, call the service, serialize the response.      |
| `*.service.ts`       | Class holding business logic; throws `AppError` on domain failures.                    |
| `*.repository.ts`    | Class of Drizzle queries; executor from `DatabaseProvider`, wrapped in `withDbErrors`. |
| `*.schema.ts`        | The Drizzle table(s) this feature owns, plus its `$inferSelect`/`$inferInsert` types.  |
| `*.constraints.ts`   | The unique/FK constraint **names** for those tables.                                   |
| `*.types.ts`         | Internal TS types + boundary interfaces (e.g. `MojangApi`).                            |
| `*.openapi.ts`       | Registers the feature's operations on the OpenAPI registry (import side effect).       |
| `*.error-catalog.ts` | Human-readable messages for this feature's error codes.                                |
| `*.outbox.ts`        | The feature's outbox message definitions (type + payload schema) and their handlers.   |

Features: `auth` (with `auth/oauth-identities`, `auth/sessions`, `auth/clients/`),
`users`, `invitations`, `minecraft` (with `minecraft/profiles`, `minecraft/server`,
and `minecraft/clients/`). Cross-cutting code sits outside
`features/`: `config/`, `infrastructure/` (`infrastructure/db/`,
`infrastructure/outbox/`), `errors/`, `http/`, `validation/`, `openapi/`,
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

Two sub-features are partial exceptions to the file-role layout above — both are
internal-only (`*.service.ts` + `*.repository.ts`, no
`*.routes.ts`/`*.controller.ts`/`*.openapi.ts`), reached only through their service:

- `auth/oauth-identities` owns the `oauth_identities` table (the provider-account →
  user link), declared in its own `*.schema.ts`. `AuthService` depends on
  `OAuthIdentityService`, never on `OAuthIdentityRepository`.
- `auth/sessions` owns the `sessions` table and the token lifecycle, plus the
  `SESSION_NOT_FOUND` / `INVALID_SESSION` codes. `AuthService` is its only consumer.

`minecraft/profiles` is the HTTP-facing whitelist sub-feature: it owns the
`minecraft_profiles` table (standalone whitelist entries — username/uuid, not tied
to users), and its service composes the Mojang seam, `MinecraftServerService`
(online status), the `TransactionManager`, and the outbox to drive the whitelist.

Path alias: `@/*` → `src/*` (and `@test/*` → `test/*`). Use `.js` extensions on
relative/alias imports (ESM). Imports never use `../`; same-directory `./` imports
are fine, anything else goes through the alias, preferring an aggregate
(`@/infrastructure/db/schemas.js`) over reaching into a feature's internals
(`@/features/users/users.schema.js`) when one exists.

## Layering & dependency injection

`routes → controller → service → repository → db`. Never skip a layer (controllers
don't touch Drizzle; repositories don't format HTTP).

Composition is explicit DI:

- `createBackend(deps)` (`backend.ts`) is the composition entry point: it calls
  `createRouter(deps)` and wraps the result in `createApp(router)`, returning
  `{ app, outboxDispatcher }`. Consumers own the returned lifecycles.
- `createRouter(deps)` (`routes/index.ts`) instantiates every repository → service →
  controller, mounts the feature routers, and builds the outbox dispatcher; it
  returns `{ router, outboxDispatcher }`. **This is where wiring lives** — add new
  features here.
- `createApp(router)` (`app.ts`) is pure HTTP assembly: middleware, the OpenAPI
  routes, the wired router under `/api`, then the error handler.
- `AppDeps` are the external boundaries: `{ db, googleTokenVerifier, mojangClient,
rconClient, processClient }`, each an **interface**. `server.ts` (the production
  composition root) injects the real clients, starts the dispatcher's poll loop, and
  owns graceful shutdown (SIGTERM/SIGINT: `server.close()` → `dispatcher.stop()` →
  `pool.end()`); tests inject fakes and never `start()` the dispatcher.

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
   (`infrastructure/db/errors.ts`). It walks the thrown error's `cause` chain (drizzle
   wraps driver failures, and a rolled-back transaction wraps them again) to find the
   pg `DatabaseError`, then: a constraint named in the `constraintErrors` map → that
   `AppError`; an unreachable/out-of-resources/shutting-down database (SQLSTATE class
   `08`/`53`/`57`, or a socket errno) → `SERVICE_UNAVAILABLE`; anything else →
   `INTERNAL`. An `AppError` raised inside the operation passes through untouched.
   Constraint names are never left to Drizzle's auto-generated defaults — every
   unique/foreign key constraint is named explicitly via the constants in the feature's
   `*.constraints.ts`, which its `*.schema.ts` and its repository both import, so a
   rename can't silently desync the two.
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
  → that user. Not found → `registerInvited`: the bootstrap check
  (`email === env.BOOTSTRAP_EMAIL`, which skips **only** the invitation requirement)
  and, for everyone else, the `InvitationService.findPending(email)` lookup (else
  `NOT_INVITED`) run **before** the transaction; inside it
  (`TransactionManager.run`), the user is created, its first `oauth_identities` row
  is inserted, and the invitation is marked accepted by that user — one unit of
  work. Session creation happens after, outside the transaction.
- **Sessions:** opaque random token in an httponly `session_token` cookie; only its
  **sha256 hash** (`lib/tokens.ts`) is stored in the `sessions` table. Cookie helpers
  in `http/session/`, base cookie options in `config/cookies.ts`.
- **CSRF:** double-submit. `requireCsrf` (`http/csrf/`) checks the non-httponly
  `csrf_token` cookie against the `x-csrf-token` header; applied to mutating routes.
- **Authorization:** `createRequireAuth(authService)` loads `req.user`/`req.session`
  from the session cookie. There are **no roles** — every authenticated user has
  full access; mutating routes additionally require the CSRF pair. 403s can only
  mean `INVALID_CSRF_TOKEN`.

## Database & migrations (Drizzle)

- The module lives in `src/infrastructure/db/`. Import it through its barrel,
  `@/infrastructure/db/index.js` — that is the drizzle client (`database.ts`, exported
  as `db`/`pool`), `DatabaseProvider`, `TransactionManager`, `withDbErrors`, and the
  `Db`/`Tx`/`DatabaseExecutor` types. Modules _inside_ `infrastructure/db/` must not
  import the barrel — that would be a cycle. Tables use `uuid` PKs (`defaultRandom()`)
  and `timestamp(..., { withTimezone: true })`.
- **Features (and infrastructure modules) own their tables.** An owner declares its
  table in `<module>.schema.ts` and its constraint names in `<module>.constraints.ts`
  (the outbox in `infrastructure/outbox/` follows the same convention);
  `db/schemas.ts` and `db/constraints.ts` only **aggregate** them (`export *`) into the
  single view the drizzle client and `drizzle-kit` need. They stay outside the
  `db/index.js` barrel because they describe what the database _looks like_, not how to
  talk to it. **A new table is invisible to migrations until it is re-exported from
  `db/schemas.ts`.**
- A `*.schema.ts` can only import **types** from `@minecraft-server/shared/*`, never
  values: drizzle-kit loads schema modules through Node's **CommonJS** resolver (its
  `resolveTsPaths` hook), which asks the shared package's ESM-only `exports` map for
  a `require` condition it doesn't have, so `db:generate` dies with
  `ERR_PACKAGE_PATH_NOT_EXPORTED` (drizzle-kit 0.31.10, the current latest — it ships
  tsx but still resolves through that hook). A value that must match a shared one is
  redeclared locally and pinned with `as const satisfies` against the imported type —
  see `whitelistStatusEnum` in `minecraft/profiles/profiles.schema.ts`.
- Which import to use for a table or row type: its own feature reaches it by relative
  path (`./users.schema.js`), and a parent feature reaches its sub-feature's by a
  descending one (`./sessions/sessions.schema.js`); everyone else goes through
  `@/infrastructure/db/schemas.js` — including a repository joining a table it doesn't
  own (see `SessionRepository`'s join on `users`). The one exception is a `*.schema.ts`
  declaring a foreign key: it imports the owning feature's schema module directly
  (`@/features/users/users.schema.js`), because routing that through the aggregate
  would be an import cycle. Constraints follow the same rule against
  `@/infrastructure/db/constraints.js`.
- **Ambient transactions.** Repositories never hold a db handle: they take
  `DatabaseProvider` (`db/provider.ts`) and resolve their executor **per query** via
  `this.databaseProvider.get()` — never cached in a field. `get()` returns the
  transaction bound to the current async context (`db/transaction/context.ts`,
  AsyncLocalStorage) or falls back to the root client. A service opens a unit of work
  with `TransactionManager.run(operation)` (`db/transaction/`); every repository call
  inside `operation` joins that transaction automatically, with no `tx` threading.
  `run` inside an already-active transaction **joins** it — no savepoints, no nesting.
  Only db infrastructure touches the context (`DatabaseProvider.require()` is the
  sanctioned way to _demand_ the ambient transaction); services depend on
  `TransactionManager` alone. External **reads** (Mojang resolution) stay outside
  `run`, resolved before it; external **side effects** (RCON, email) that must follow
  a commit are not called after `run` — they are **enqueued as outbox messages inside
  it** and executed by the dispatcher after commit (see
  `MinecraftProfileService.create` and the next section).
- Migrations are SQL under `migrations/`, generated by `drizzle-kit`. Config
  (`drizzle.config.ts`) forces `host=localhost`, so run these from the **host** with
  the `db` service up:
  - `pnpm --filter @minecraft-server/backend db:generate` (from schema diffs)
  - `pnpm --filter @minecraft-server/backend db:migrate`
  - `db:studio` for the Drizzle Studio UI.

## Transactional outbox

`src/infrastructure/outbox/` makes side effects atomic with the state change that
causes them: a service enqueues a message **inside** `TransactionManager.run` (via
`OutboxService.enqueue`, which requires the ambient transaction —
`MissingTransactionError` outside one), and the `OutboxDispatcher` — a poll loop
started only in `server.ts` — claims due messages after commit and runs their
handlers, with retries.

- **Ownership mirrors tables**: a feature declares its message types, zod payload
  schemas, and handlers in `<feature>.outbox.ts` (see
  `features/minecraft/profiles/profiles.outbox.ts`); `outbox.registry.ts` only
  **aggregates** the definitions (spread pattern, like `errorMeta`). The registry
  stays outside the outbox barrel — it imports the features, which import the barrel.
  `AppOutboxService` (from the registry) is the type feature services inject, giving
  `enqueue` per-type payload checking. Handlers are wired in `routes/index.ts`;
  `createOutboxHandlerRegistry` fails startup on a missing/duplicate/unknown handler.
- **`status` is the lifecycle state** (`pending` → `processing` →
  `completed`/`dead`), and the **dispatcher is its only writer** — enqueueing is the
  one exception, and it can only produce `pending`. Due = `pending`/`processing` with
  `nextAttemptAt` passed and the claim absent or expired; terminal rows
  (`completed`/`dead`) are kept as an audit trail and never claimed again, with
  `lastError` kept on the dead ones. Claims are time-boxed (`claimExpiresAt`) and
  fenced: every claim stamps a fresh `claimId`, and `markCompleted`/`markFailed` are
  compare-and-set on `(claimId, status = 'processing')`, so an expired claim's worker
  can't stomp a newer claim's outcome. Failures retry with exponential backoff via
  `nextAttemptAt` until `maxAttempts`, then go `dead` (loud `console.error`). The one
  status no worker can record is a process that died mid-attempt: `tick()` opens with
  `markAbandonedDead` (expired claim + attempts spent → `dead`), which returns the
  rows it buried so they still get their last rites. A dead worker's message with
  attempts left is simply re-claimed once its claim expires.
- **`OutboxHandler.onDeadLetter`** (optional) is the handler's last rites — called
  once, after the `dead` status is committed, for features that need to reconcile
  state they can no longer converge. Both roads to `dead` call it: the attempt that
  exhausted `maxAttempts` (with the handler's own error) and `markAbandonedDead`
  (with a synthetic "abandoned mid-attempt" error carrying the last error the row
  recorded). At-most-once falls out of the status: each caller gets there by being
  the one that moved the row out of `processing`. Best-effort otherwise — it runs
  outside any transaction, a throw is only logged, and it is skipped when there is no
  parsed payload to hand over (unknown type, unparsable payload). No handler
  implements it today.
- **Ordering assumes ONE dispatcher instance** (the single backend process): chained
  non-overlapping ticks processing each batch sequentially in creation order give
  FIFO. More instances would stay safe (`FOR UPDATE SKIP LOCKED` + fencing) but
  interleave; and retries can reorder regardless — so handlers must be idempotent and
  **converge to current DB state** (re-check it, no-op when stale) rather than trust
  the payload as a snapshot.
- **Tests never `start()` the dispatcher** — api tests drive it deterministically
  with `await testApp.outboxDispatcher.tick()` after the request settles.

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

- **`invitations.invitedByUserId`** is `NOT NULL` but its FK is `ON DELETE SET NULL`
  — deleting the inviting user would violate the not-null constraint instead of
  cleanly nulling it out. Harmless today (no user-deletion path exists), but it must
  be resolved (nullable column vs. restrict/no-op the delete) **before** building
  the planned user-deletion feature.
