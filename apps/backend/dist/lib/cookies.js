// apps/backend/src/lib/cookies.ts
import { cookieConfig } from "../config/cookies.js";
export function getCookie(req, name) {
  return req.cookies[name];
}
export function setCookie(res, name, value, options) {
  res.cookie(name, value, { ...cookieConfig, ...options });
}
export function clearCookie(res, name, options) {
  res.clearCookie(name, { ...cookieConfig, ...options });
}
//# sourceMappingURL=cookies.js.map
