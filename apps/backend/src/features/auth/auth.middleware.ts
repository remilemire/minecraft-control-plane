// apps/backend/src/features/auth/auth.middleware.ts

import { getSessionCookie } from "@/features/sessions/sessions.cookies.js";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AdminRequiredError, UnauthenticatedError } from "./auth.errors.js";
import type { AuthService } from "./auth.service.js";

export function createRequireAuth(authService: AuthService): RequestHandler {
  return async function (req: Request, _res: Response, next: NextFunction): Promise<void> {
    const sessionToken = getSessionCookie(req);

    if (sessionToken === undefined) {
      throw new UnauthenticatedError();
    }

    const { user, session } = await authService.authenticateFromSession(sessionToken);

    req.session = session;
    req.user = user;
    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    throw new AdminRequiredError();
  }
  next();
}
