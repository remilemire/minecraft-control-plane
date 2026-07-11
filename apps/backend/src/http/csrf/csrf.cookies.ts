// apps/backend/src/http/csrf/csrf.cookies.ts

import { env } from "@/config/env.js";
import { clearCookie, getCookie, setCookie } from "@/http/cookies.js";
import type { Request, Response } from "express";
import { CSRF_COOKIE, CSRF_HEADER } from "./csrf.constants.js";

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
