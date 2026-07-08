// apps/backend/src/security/csrf.middleware.ts
import { ForbiddenError } from "@/errors/http-errors.js";
import { getCsrfCookie, getCsrfHeader } from "./csrf.cookies.js";
export function requireCsrf(req, _res, next) {
    const cookieToken = getCsrfCookie(req);
    const headerToken = getCsrfHeader(req);
    if (!!cookieToken && !!headerToken && cookieToken === headerToken) {
        throw new ForbiddenError("Invalid CSRF-token.");
    }
    next();
}
//# sourceMappingURL=csrf.middleware.js.map