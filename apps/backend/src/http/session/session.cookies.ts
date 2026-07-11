// apps/backend/src/http/session/session.cookies.ts

import { env } from "@/config/env.js";
import { clearCookie, getCookie, setCookie, type CookieOverrides } from "@/http/cookies.js";
import type { Request, Response } from "express";
import { SESSION_COOKIE } from "./session.constants.js";

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
