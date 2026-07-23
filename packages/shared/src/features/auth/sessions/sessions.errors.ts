// packages/shared/src/features/auth/sessions/sessions.errors.ts

import type { ErrorMeta } from "@/common/index.js";

export const sessionErrorMeta = {
  SESSION_NOT_FOUND: { kind: "NOT_FOUND" },
  // Raised when a presented session token matches nothing usable — unknown,
  // already deleted, or past its expiry. Distinct from SESSION_NOT_FOUND,
  // which is the repository failing to find a row to delete.
  INVALID_SESSION: { kind: "UNAUTHORIZED" },
} as const satisfies ErrorMeta;

export type SessionErrorCode = keyof typeof sessionErrorMeta;
