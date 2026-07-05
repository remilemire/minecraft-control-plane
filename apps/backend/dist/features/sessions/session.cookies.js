// apps/backend/src/features/sessions/session.cookies.ts
import { env } from "@/config/env.js";
import { clearCookie, getCookie, setCookie, } from "@/lib/cookies.js";
export const SESSION_COOKIE = "session_token";
const sessionCookieOptions = {
    maxAge: env.SESSION_TTL_MS,
};
export function getSessionCookie(req) {
    return getCookie(req, SESSION_COOKIE);
}
export function setSessionCookie(res, sessionToken) {
    setCookie(res, SESSION_COOKIE, sessionToken, sessionCookieOptions);
}
export function clearSessionCookie(res) {
    clearCookie(res, SESSION_COOKIE, sessionCookieOptions);
}
//# sourceMappingURL=session.cookies.js.map