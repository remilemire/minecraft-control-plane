// backend/src/security/csrf.cookies.ts
import { env } from "@/config/env.js";
import { clearCookie, getCookie, setCookie } from "@/lib/cookies.js";
export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-Token";
export function setCsrfCookie(res, csrfToken) {
    setCookie(res, CSRF_COOKIE, csrfToken, {
        httpOnly: false,
        maxAge: env.CSRF_TTL_MS,
    });
}
export function clearCsrfCookie(res) {
    clearCookie(res, CSRF_COOKIE);
}
export function verifyCsrf(req) {
    const cookieToken = getCookie(req, CSRF_COOKIE);
    const headerToken = req.get(CSRF_HEADER);
    return !!cookieToken && !!headerToken && cookieToken === headerToken;
}
//# sourceMappingURL=csrf.cookies.js.map