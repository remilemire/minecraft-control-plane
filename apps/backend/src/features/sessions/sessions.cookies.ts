// apps/backend/src/features/sessions/sessions.cookies.ts

import { env } from "@/config/env.js";
import { clearCookie, getCookie, setCookie, type CookieOverrides } from "@/security/cookies.js";
import type { Request, Response } from "express";

export const SESSION_COOKIE = "session_token";

const sessionCookieOptions: CookieOverrides = {
  maxAge: env.SESSION_TTL_MS,
};

export function getSessionCookie(req: Request): string | undefined {
  return getCookie(req, SESSION_COOKIE);
}

export function setSessionCookie(res: Response, token: string): void {
  setCookie(res, SESSION_COOKIE, token, sessionCookieOptions);
}

export function clearSessionCookie(res: Response): void {
  clearCookie(res, SESSION_COOKIE, sessionCookieOptions);
}
