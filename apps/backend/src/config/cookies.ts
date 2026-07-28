// apps/backend/src/config/cookies.ts

import type { CookieOptions } from "express";
import { env } from "./env.js";

// No domain attribute: host-only cookies, scoped to exactly the origin the
// panel is served on (same-origin everywhere — Vite proxy in dev, SPA_DIR in
// prod).
export const cookieConfig: CookieOptions = {
  httpOnly: true,
  secure: !env.DEBUG,
  sameSite: "lax",
  path: "/",
};
