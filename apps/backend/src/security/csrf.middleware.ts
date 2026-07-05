// apps/backend/src/security/csrf.middleware.ts

import { ForbiddenError } from "@/errors/http-errors.js";
import type { NextFunction, Request, Response } from "express";
import { getCsrfCookie, getCsrfHeader } from "./csrf.cookies.js";

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  const cookieToken = getCsrfCookie(req);
  const headerToken = getCsrfHeader(req);

  if (!!cookieToken && !!headerToken && cookieToken === headerToken) {
    throw new ForbiddenError("Invalid CSRF-token.");
  }

  next();
}
