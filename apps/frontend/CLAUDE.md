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
  components/  Minecraft-styled primitives: McPanel, McButton, McInput, McBadge,
               McConfirmButton (two-click destructive confirm), ErrorText,
               LoadingText, AppLayout (authed shell: header/logout)
  features/    feature-first, mirrors the backend: <feature>/api.ts (fetchers)
               + components; minecraft splits into profiles/ and server/
  lib/         apiClient.ts (fetch wrapper), cookies.ts, useRequest.ts, format.ts
  pages/       route compositions: HomePage (the whole dashboard), NotFoundPage
  assets/      bundled Monocraft font (OFL) + generated background.svg tile
  index.css    the whole theme: @theme tokens + mc-raised/mc-inset utilities
```

## Contracts with the backend

- **Responses are parsed through the shared schemas**
  (`@minecraft-server/shared/<feature>`). Wire timestamps are ISO strings while the
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
  RequireAuth → `/login`, RequireGuest → `/`. There are no roles — every
  authenticated user sees the same single-page dashboard.
- Google sign-in loads the GIS script lazily (`features/auth/googleIdentity.ts`) and
  needs `VITE_GOOGLE_CLIENT_ID` (same OAuth client as the backend's
  `GOOGLE_CLIENT_ID`).
- The Vite dev server proxies `/api` to `BACKEND_ORIGIN` (compose overrides it to
  `http://backend:8000` inside the network), so dev is same-origin — no CORS.

## Minecraft GUI conventions

- All colors/fonts come from the `@theme` tokens in `index.css` (slot greys
  `#373737`/`#4C4C4C`, highlight `#FFFF55`, chat green/red, shadow `#3F3F3F`) —
  don't hardcode colors in components.
- `mc-raised` = light top/left + dark bottom/right bevel (buttons, panels);
  `mc-inset` = the inverse (inventory slots, inputs). **No rounded corners
  anywhere**; body text carries the 2px drop shadow globally.
- The pixel font is bundled Monocraft (OFL — license alongside the .ttf files).

## Data fetching

`useRequest(load)` (`lib/useRequest.ts`) fetches on mount and on `reload()`. `load`
must be identity-stable (module-level fn); previous data stays visible while a
reload is in flight. Mutations live in component handlers and call `reload()` on
success — there's no cache/store.

Backend state that settles asynchronously is polled by interval-calling `reload()`
**only while something is unsettled** (`ProfilesPanel` does this while any profile's
`whitelistStatus` is `pending`), and such a panel renders `<LoadingText />` only on
the first load (`loading && data === null`) so polls don't blink the list away.

## Testing

- Colocated `src/**/*.test.{ts,tsx}` (jsdom, globals on, `test/setup.ts` wires
  jest-dom). Helpers in `test/helpers/`: `renderWithAuth` / `makeUser` /
  `makeAuthValue` inject `AuthContext` + `MemoryRouter` directly instead of mocking
  fetch.
- Feature components mock their sibling `./api` module with `vi.mock`; `apiClient`
  tests stub global `fetch`. Fake-timer tests (McConfirmButton) use `fireEvent`, not
  `userEvent` (which hangs under fake timers).
