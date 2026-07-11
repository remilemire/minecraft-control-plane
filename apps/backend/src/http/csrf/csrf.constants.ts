// apps/backend/src/http/csrf/csrf.constants.ts

// Pure cookie/header names — no config/env import, so it's safe for modules
// (like OpenAPI registration) that must not trigger environment validation.
export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-Token";
