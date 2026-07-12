// apps/backend/src/features/auth/auth.middleware.ts
import { AppError } from "../../errors/app-error.js";
import { getSessionCookie } from "../../http/session/session.cookies.js";
export function createRequireAuth(authService) {
  return async function (req, _res, next) {
    const sessionToken = getSessionCookie(req);
    if (sessionToken === undefined) {
      throw new AppError("UNAUTHENTICATED");
    }
    const { user, session } = await authService.authenticateFromSession(sessionToken);
    req.session = session;
    req.user = user;
    next();
  };
}
export function requireAdmin(req, _res, next) {
  if (!req.user?.isAdmin) {
    throw new AppError("ADMIN_REQUIRED");
  }
  next();
}
//# sourceMappingURL=auth.middleware.js.map
