// apps/backend/src/features/auth/auth.middleware.ts
import { ForbiddenError, UnauthorizedError } from "@/errors/http-errors.js";
import { getSessionCookie } from "../sessions/session.cookies.js";
export function createRequireAuth(authService) {
    return async function (req, res, next) {
        const sessionToken = getSessionCookie(req);
        if (sessionToken === undefined) {
            throw new UnauthorizedError("Invalid session.");
        }
        const { user, session } = await authService.authenticate(sessionToken);
        req.session = session;
        req.user = user;
        next();
    };
}
export function requireAdmin(req, res, next) {
    if (!req.user?.isAdmin) {
        throw new ForbiddenError();
    }
    next();
}
//# sourceMappingURL=auth.middleware.js.map