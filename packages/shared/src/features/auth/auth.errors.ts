// packages/shared/src/features/auth/auth.errors.ts

import type { ErrorMeta } from "@/common/index.js";

// Auth's own codes. Session-lifecycle codes live in `sessions/sessions.errors.ts`
// and provider-credential codes in `clients/clients.errors.ts`; all three are
// re-exported from this feature's barrel.
export const authErrorMeta = {
  UNAUTHENTICATED: { kind: "UNAUTHORIZED" },
  NOT_INVITED: { kind: "FORBIDDEN" },
  INVALID_CSRF_TOKEN: { kind: "FORBIDDEN" },
} as const satisfies ErrorMeta;

export type AuthErrorCode = keyof typeof authErrorMeta;
