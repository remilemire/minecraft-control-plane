// apps/backend/src/security/csrf.ts

import { env } from "@/config/env.js";
import { ForbiddenError } from "@/errors/http-errors.js";
import { clearCookie, getCookie, setCookie } from "@/security/cookies.js";
import type { NextFunction, Request, Response } from "express";

export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-Token";

export function getCsrfCookie(req: Request): string | undefined {
  return getCookie(req, CSRF_COOKIE);
}

export function getCsrfHeader(req: Request): string | undefined {
  return req.get(CSRF_HEADER);
}

export function setCsrfCookie(res: Response, csrfToken: string): void {
  setCookie(res, CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    maxAge: env.CSRF_TTL_MS,
  });
}

export function clearCsrfCookie(res: Response): void {
  clearCookie(res, CSRF_COOKIE);
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  const cookieToken = getCsrfCookie(req);
  const headerToken = getCsrfHeader(req);

  if (!!cookieToken && !!headerToken && cookieToken === headerToken) {
    throw new ForbiddenError("Invalid CSRF-token.");
  }

  next();
}
