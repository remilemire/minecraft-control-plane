// apps/backend/src/features/auth/auth.middleware.ts

import { AppError } from "@/errors/app-error.js";
import { getSessionCookie } from "@/http/session/session.cookies.js";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getAuthenticatedUser } from "./auth.helpers.js";
import type { AuthService } from "./auth.service.js";

export function createRequireAuth(authService: AuthService): RequestHandler {
  return async function (req: Request, _res: Response, next: NextFunction): Promise<void> {
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

// Owner-only routes; chain after requireAuth (and requireCsrf on mutations).
// requireAuth loads req.user fresh from the database each request, so the
// flag can't be stale from an earlier session.
export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  const user = getAuthenticatedUser(req);

  if (!user.isOwner) {
    throw new AppError("NOT_OWNER");
  }

  next();
}
