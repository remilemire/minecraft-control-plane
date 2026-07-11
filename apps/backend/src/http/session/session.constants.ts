// apps/backend/src/http/session/session.constants.ts

// Pure cookie name — no config/env import, so it's safe for modules (like
// OpenAPI registration) that must not trigger environment validation.
export const SESSION_COOKIE = "session_token";
