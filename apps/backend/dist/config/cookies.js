// apps/backend/src/config/cookies.ts
import { env } from "./env.js";
export const cookieConfig = {
  httpOnly: true,
  secure: !env.DEBUG,
  sameSite: "lax",
  path: "/",
  domain: env.COOKIE_DOMAIN,
};
//# sourceMappingURL=cookies.js.map
