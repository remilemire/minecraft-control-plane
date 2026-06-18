// backend/src/features/auth/auth.middleware.ts

import { ForbiddenError, UnauthorizedError } from "@/errors/http-errors.js";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getSessionCookie } from "../sessions/session.cookies.js";
import type { AuthService } from "./auth.service.js";

export function createRequireAuth(authService: AuthService): RequestHandler {
  return async function (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
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

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user?.isAdmin) {
    throw new ForbiddenError();
  }
  next();
}
