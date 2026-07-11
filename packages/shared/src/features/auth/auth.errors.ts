// packages/shared/src/features/auth/auth.errors.ts

import type { ErrorCatalog } from "../../common/errors.js";

export const authErrorCatalog = {
  UNAUTHENTICATED: { kind: "UNAUTHORIZED" },
  INVALID_SESSION: { kind: "UNAUTHORIZED" },
  INVALID_GOOGLE_CREDENTIAL: { kind: "UNAUTHORIZED" },
  NOT_INVITED: { kind: "FORBIDDEN" },
  ADMIN_REQUIRED: { kind: "FORBIDDEN" },
  INVALID_CSRF_TOKEN: { kind: "FORBIDDEN" },
} as const satisfies ErrorCatalog;

export type AuthErrorCode = keyof typeof authErrorCatalog;
