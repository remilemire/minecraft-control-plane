// backend/src/config/cookies.ts

import type { CookieOptions } from "express";
import { env } from "./env.js";

export const cookieConfig: CookieOptions = {
  httpOnly: true,
  secure: !env.DEBUG,
  sameSite: "lax",
  path: "/",
  domain: env.COOKIE_DOMAIN,
};
