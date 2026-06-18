// backend/src/features/sessions/session.cookies.ts

import { env } from "@/config/env.js";
import {
  clearCookie,
  getCookie,
  setCookie,
  type CookieOverrides,
} from "@/lib/cookies.js";
import type { Request, Response } from "express";
import type { SessionToken } from "./session.types.js";

export const SESSION_COOKIE = "session_token";

const sessionCookieOptions: CookieOverrides = {
  maxAge: env.SESSION_TTL_MS,
};

export function getSessionCookie(req: Request): SessionToken | undefined {
  return getCookie(req, SESSION_COOKIE) as SessionToken;
}

export function setSessionCookie(
  res: Response,
  sessionToken: SessionToken,
): void {
  setCookie(res, SESSION_COOKIE, sessionToken, sessionCookieOptions);
}

export function clearSessionCookie(res: Response): void {
  clearCookie(res, SESSION_COOKIE, sessionCookieOptions);
}
