// apps/backend/src/features/auth/auth.error-meta.ts

import type { ErrorMeta } from "@/errors/meta-types.js";
import type { AuthErrorCode } from "@minecraft-server/shared/auth";

export const authErrorMeta = {
  UNAUTHENTICATED: { message: "Authentication required." },
  INVALID_SESSION: { message: "Invalid or expired session." },
  INVALID_GOOGLE_CREDENTIAL: { message: "The Google credential is invalid or expired." },
  NOT_INVITED: { message: "Invite only." },
  ADMIN_REQUIRED: { message: "You do not have permission to perform this action." },
  INVALID_CSRF_TOKEN: { message: "Invalid CSRF token." },
} as const satisfies ErrorMeta<AuthErrorCode>;
