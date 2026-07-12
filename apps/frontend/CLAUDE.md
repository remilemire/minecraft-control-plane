# CLAUDE.md — frontend

Keep this dead simple for now: the frontend is a **skeleton**. `App.tsx` renders
nothing; `src/app/router.tsx`, `src/app/providers/AuthProvider.tsx`, and
`src/lib/apiClient.ts` are empty stubs. `main.tsx` mounts `<App>` inside
`<BrowserRouter>`.

Stack: **React 19 + Vite**, **Tailwind v4** (via `@tailwindcss/vite` — no
`tailwind.config`; configure in CSS), **React Router**. TS strict; `@/*` → `src/*`.
ESLint (flat, + react-hooks / react-refresh) + Prettier
(`prettier-plugin-tailwindcss`). Tests use Vitest + jsdom.

When building it out, two durable contracts with the backend:

- **Shared types/schemas:** import from `@minecraft-server/shared/<feature>` rather
  than redefining request/response shapes.
- **Auth:** sign-in posts a Google credential to `POST /api/auth/google`. The backend
  uses a cookie session + CSRF double-submit, so requests need credentials (cookies),
  and mutations must copy the `csrf_token` cookie into an `x-csrf-token` header.

Update this file as real structure and conventions land.
