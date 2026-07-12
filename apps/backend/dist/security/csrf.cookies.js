// apps/backend/src/security/csrf.cookies.ts
import { env } from "../config/env.js";
import { clearCookie, getCookie, setCookie } from "../security/cookies.js";
export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-Token";
export function getCsrfCookie(req) {
  return getCookie(req, CSRF_COOKIE);
}
export function getCsrfHeader(req) {
  return req.get(CSRF_HEADER);
}
export function setCsrfCookie(res, csrfToken) {
  setCookie(res, CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    maxAge: env.CSRF_TTL_MS,
  });
}
export function clearCsrfCookie(res) {
  clearCookie(res, CSRF_COOKIE);
}
//# sourceMappingURL=csrf.cookies.js.map
