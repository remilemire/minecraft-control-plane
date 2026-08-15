// packages/shared/src/features/auth/auth.errors.ts

import type { ErrorMeta } from "@/common/index.js";

// Auth's own codes. Session-lifecycle codes live in `sessions/sessions.errors.ts`
// and are re-exported from this feature's barrel.
export const authErrorMeta = {
  UNAUTHENTICATED: { kind: "UNAUTHORIZED" },
  // The single code every login failure maps to — invalid credential,
  // unverified email, unregistered email — so responses can't be used to
  // enumerate which emails have accounts.
  AUTHENTICATION_FAILED: { kind: "UNAUTHORIZED" },
  NOT_OWNER: { kind: "FORBIDDEN" },
  INVALID_CSRF_TOKEN: { kind: "FORBIDDEN" },
} as const satisfies ErrorMeta;

export type AuthErrorCode = keyof typeof authErrorMeta;
