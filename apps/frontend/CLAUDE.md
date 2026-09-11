# CLAUDE.md — frontend

React 19 + Vite SPA for the admin panel. Read the [root guide](../../CLAUDE.md) for
the product model, monorepo layout, env, and commands. This file covers frontend
internals. Keep it high-signal and update it when conventions change.

Stack: **React 19 + Vite**, **Tailwind v4** (via `@tailwindcss/vite` — no
`tailwind.config`; the theme lives in `src/index.css`), **React Router** (plain
`<Routes>`, no data router), **Vitest + jsdom + Testing Library**. TS strict.
Aliases: `@/*` → `src/*`, `@test/*` → `test/*`. Unlike the backend, imports use
**no `.js` extensions** (bundler resolution).

## Layout

```
src/
  app/         router.tsx, providers/ (AuthProvider + auth-context), guards/
               (RequireAuth / RequireGuest — Outlet-based)
  components/  Minecraft-styled primitives: McPanel (optional `actions` slot —
               panel-wide controls right-aligned on the title row), McButton,
               McInput, McBadge,
               McConfirmButton (two-click destructive confirm), ErrorText,
               LoadingText, AppLayout (authed shell: header/logout)
  features/    feature-first, mirrors the backend: <feature>/api.ts (fetchers)
               + components; minecraft splits into profiles/ and server/ (with
               its console/ sub-feature)
  lib/         apiClient.ts (fetch wrapper), cookies.ts, useRequest.ts,
               usePoll.ts (visibility-aware interval), format.ts
  pages/       route compositions: HomePage (the whole dashboard), NotFoundPage
  assets/      bundled Monocraft font (OFL) + generated background.svg tile
  index.css    the whole theme: @theme tokens + mc-raised/mc-inset utilities
```

## Contracts with the backend

- **Responses are parsed through the shared schemas**
  (`@minecraft-control-plane/shared/<feature>`). Wire timestamps are ISO strings while the
  shared schemas type them as `Date`, so feature `api.ts` modules extend response
  schemas with `z.coerce.date()` (see `features/users/api.ts`).
- **Everything goes through `apiRequest`** (`lib/apiClient.ts`): same-origin `/api`,
  cookies sent, and every non-GET request echoes the `csrf_token` cookie into the
  `x-csrf-token` header (double-submit). Failures throw `ApiError`
  (`{ kind, code, message, issues? }`) — branch on `code` when a failure has UI
  meaning (e.g. ProfilesPanel surfaces `MINECRAFT_USERNAME_TAKEN` inline).
- **Request bodies are parsed through the shared input schemas before sending**, and
  forms `safeParse` the same schemas for inline errors (with `noValidate` so the
  browser's native validation doesn't preempt ours).

## Auth

- `AuthProvider` probes `GET /users/me` on mount → `loading` | `authenticated` |
  `unauthenticated`; `login(credential)` posts to `/auth/google`. Guards redirect:
  RequireAuth → `/login`, RequireGuest → `/`. Everyone sees the same single-page
  dashboard; the single **owner** (`user.isOwner` from `useAuth()`) additionally
  sees the UsersPanel's provision form and per-row "Make owner" transfer action.
  After transferring ownership away, the AuthContext user is stale until the next
  `fetchMe` — the backend re-checks on every request, so this is cosmetic.
- Google sign-in loads the GIS script lazily (`features/auth/googleIdentity.ts`) and
  needs `VITE_GOOGLE_CLIENT_ID` — from `apps/frontend/.env` in host dev, and baked
  in at build time from the root `GOOGLE_CLIENT_ID` (build arg) for prod images.
- The Vite dev server proxies `/api` to `BACKEND_ORIGIN` (defaulted to
  `http://localhost:8000` in vite.config; the compose dev override injects
  `http://backend:8000`), so dev is same-origin — no CORS.
- **Prod has no frontend container**: the backend image runs `vite build` and
  serves `dist/` same-origin (its `SPA_DIR`), with a history-API fallback to
  `index.html` — deep links and the client-rendered 404 both work.

## Minecraft GUI conventions

- All colors/fonts come from the `@theme` tokens in `index.css` (slot greys
  `#373737`/`#4C4C4C`, highlight `#FFFF55`, chat green/red, shadow `#3F3F3F`,
  plus the console log view's Homebrew-terminal pair — green on black, no text
  shadow) — don't hardcode colors in components.
- `mc-raised` = light top/left + dark bottom/right bevel (buttons, panels);
  `mc-inset` = the inverse (inventory slots, inputs). **No rounded corners
  anywhere**; body text carries the 2px drop shadow globally.
- The pixel font is bundled Monocraft (OFL — license alongside the .ttf files).

## Data fetching

`useRequest(load)` (`lib/useRequest.ts`) fetches on mount and on `reload()`. `load`
must be identity-stable (module-level fn); previous data stays visible while a
reload is in flight **and survives one that fails** — `data` is only ever replaced
by a success, so a panel renders the error _beside_ its last good data, never
instead of it. Mutations live in component handlers and call `reload()` on
success — there's no cache/store.

Polling goes through **`usePoll(onPoll, intervalMs)`** (`lib/usePoll.ts`) — never a
hand-rolled `setInterval` effect. It runs only while the page is visible and fires
once on the way back, so a backgrounded tab costs nothing and a returning one is
never stale. Panels compose it with `useRequest`: `usePoll(reload, ms)`.

The cadence follows what the response actually contains. **Settling** state (a
`whitelistStatus` that ends at `whitelisted`) justifies a fast poll that stops, but
**live** state (`online`, the server's run status) never settles and must keep
polling for as long as the panel is mounted — a response carrying both takes the
union, as `ProfilesPanel` does: 3s while any profile is `pending`, 15s forever
otherwise. Getting this wrong is invisible in the happy path, since a page reload
refetches and looks correct. Live cadences are deliberately **in step across panels**
(both minecraft panels poll 15s): they describe one server, so drifting them apart
lets the dashboard contradict itself.

A polling panel renders `<LoadingText />` only on the first load
(`loading && data === null`) so polls don't blink the list away, and disables its
manual Refresh button on that same first load rather than on `loading` — otherwise
every poll greys the button out.

The console is the one streaming feature: `server/console/api.ts` wraps
`EventSource` over the backend's SSE log endpoint (`openConsoleLogStream`,
returning a closer), and **the frontend owns the connection status** — the
browser auto-reconnects and every connect replays a tail of recent lines with
no deduplication upstream, so `ConsolePanel` marks drop/reconnect seams with
notice lines in the log view instead.

The console also **drops known-noise lines on the way in** (`console/noise.ts`,
applied in `onLog` before the entry is appended). The noise is self-inflicted:
each online-status poll and each outbox whitelist opens an RCON connection and
closes it, and Minecraft logs a thread start and shutdown for every one — so the
rate is set by the poll cadence. Filtering at ingestion rather than at render
keeps that churn from pushing real output out of the capped buffer. Keep the
patterns narrow enough that an RCON line reporting an actual failure survives.

## Testing

- Colocated `src/**/*.test.{ts,tsx}` (jsdom, globals on, `test/setup.ts` wires
  jest-dom). Helpers in `test/helpers/`: `renderWithAuth` / `makeUser` /
  `makeAuthValue` inject `AuthContext` + `MemoryRouter` directly instead of mocking
  fetch.
- Feature components mock their sibling `./api` module with `vi.mock`; `apiClient`
  tests stub global `fetch`, and the console's `api.test.ts` stubs global
  `EventSource` (jsdom ships none). Fake-timer tests (McConfirmButton) use
  `fireEvent`, not `userEvent` (which hangs under fake timers).

## Backups panel

`minecraft/backups` owns archive listing, four independent schedule toggles, and
the restore preview/confirmation. Use the shared schemas and `apiRequest` as for
other features. Poll maintenance every 3 seconds while active and every 15 seconds
otherwise; the controller journal restores progress after page reloads. HomePage
passes maintenance state to power and console controls, while the server status
response also carries maintenance. Frontend disabling is explanatory; controller
coordination enforces conflicts. Retain request UUIDs after uncertain submission
failures so retries refer to the same durable operation.
