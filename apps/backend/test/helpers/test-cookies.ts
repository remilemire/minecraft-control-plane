// apps/backend/test/helpers/test-cookies.ts

import { CSRF_COOKIE, CSRF_HEADER } from "@/http/csrf/csrf.constants.js";
import { SESSION_COOKIE } from "@/http/session/session.constants.js";
import { generateRandomSecret } from "@/lib/tokens.js";

export function sessionCookie(sessionToken: string): string {
  return `${SESSION_COOKIE}=${sessionToken}`;
}

export interface CsrfPair {
  readonly cookie: string;
  readonly headerName: string;
  readonly headerValue: string;
}

// Matching cookie + header for the double-submit CSRF check. Pass different
// tokens yourself when testing the mismatch path.
export function csrfPair(token: string = generateRandomSecret()): CsrfPair {
  return {
    cookie: `${CSRF_COOKIE}=${token}`,
    headerName: CSRF_HEADER,
    headerValue: token,
  };
}

interface WithSetCookie {
  readonly headers: Record<string, string | string[] | undefined>;
}

// Normalizes supertest's Set-Cookie header (array, single string, or absent)
// into a plain array of "name=value; Attr=..." strings.
export function getSetCookies(response: WithSetCookie): string[] {
  const raw = response.headers["set-cookie"];
  if (Array.isArray(raw)) {
    return raw;
  }
  return typeof raw === "string" ? [raw] : [];
}

export function findSetCookie(response: WithSetCookie, name: string): string | undefined {
  return getSetCookies(response).find((cookie) => cookie.startsWith(`${name}=`));
}

// A cookie is "cleared" when the server backdates its expiry to the epoch.
export function isClearedCookie(setCookie: string | undefined): boolean {
  return setCookie !== undefined && /expires=thu, 01 jan 1970/i.test(setCookie);
}
