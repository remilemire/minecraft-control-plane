// apps/backend/src/features/auth/auth.middleware.ts
import { ForbiddenError, UnauthorizedError } from "@/errors/index.js";
import { getSessionCookie } from "@/features/sessions/sessions.cookies.js";
export function createRequireAuth(authService) {
    return async function (req, _res, next) {
        const sessionToken = getSessionCookie(req);
        if (sessionToken === undefined) {
            throw new UnauthorizedError("Invalid session.");
        }
        const { user, session } = await authService.authenticateFromSession(sessionToken);
        req.session = session;
        req.user = user;
        next();
    };
}
export function requireAdmin(req, _res, next) {
    if (!req.user?.isAdmin) {
        throw new ForbiddenError();
    }
    next();
}
//# sourceMappingURL=auth.middleware.js.map