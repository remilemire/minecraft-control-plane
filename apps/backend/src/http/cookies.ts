// apps/backend/src/http/cookies.ts

import { cookieConfig } from "@/config/cookies.js";
import type { CookieOptions, Request, Response } from "express";

export interface CookieOverrides extends Partial<CookieOptions> {
  readonly httpOnly?: boolean;
  readonly maxAge?: number;
}

export function getCookie(req: Request, name: string): string | undefined {
  return req.cookies[name];
}

export function setCookie(
  res: Response,
  name: string,
  value: string,
  options?: CookieOverrides,
): void {
  res.cookie(name, value, { ...cookieConfig, ...options });
}

export function clearCookie(res: Response, name: string, options?: CookieOverrides): void {
  res.clearCookie(name, { ...cookieConfig, ...options });
}
