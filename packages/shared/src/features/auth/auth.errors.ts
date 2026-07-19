// packages/shared/src/features/auth/auth.errors.ts

import type { ErrorMeta } from "@/common/index.js";

export const authErrorMeta = {
  UNAUTHENTICATED: { kind: "UNAUTHORIZED" },
  INVALID_SESSION: { kind: "UNAUTHORIZED" },
  INVALID_GOOGLE_CREDENTIAL: { kind: "UNAUTHORIZED" },
  NOT_INVITED: { kind: "FORBIDDEN" },
  ADMIN_REQUIRED: { kind: "FORBIDDEN" },
  INVALID_CSRF_TOKEN: { kind: "FORBIDDEN" },
} as const satisfies ErrorMeta;

export type AuthErrorCode = keyof typeof authErrorMeta;
