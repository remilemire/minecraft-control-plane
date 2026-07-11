// apps/backend/src/http/csrf/csrf.middleware.ts

import { AppError } from "@/errors/app-error.js";
import type { NextFunction, Request, Response } from "express";
import { getCsrfCookie, getCsrfHeader } from "./csrf.cookies.js";

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  const cookieToken = getCsrfCookie(req);
  const headerToken = getCsrfHeader(req);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new AppError("INVALID_CSRF_TOKEN");
  }

  next();
}
