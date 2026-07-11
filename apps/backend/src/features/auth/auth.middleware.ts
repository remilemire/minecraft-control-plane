// apps/backend/src/features/auth/auth.middleware.ts

import { AppError } from "@/errors/app-error.js";
import { getSessionCookie } from "@/http/session/session.cookies.js";
import type { NextFunction, Request, RequestHandler, Response } from "express";
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

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    throw new AppError("ADMIN_REQUIRED");
  }
  next();
}
