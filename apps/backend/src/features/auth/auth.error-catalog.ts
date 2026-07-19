// apps/backend/src/features/auth/auth.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { AuthErrorCode } from "@minecraft-server/shared/auth";

export const authErrorCatalog = {
  UNAUTHENTICATED: { message: "Authentication required." },
  INVALID_SESSION: { message: "Invalid or expired session." },
  INVALID_GOOGLE_CREDENTIAL: { message: "The Google credential is invalid or expired." },
  NOT_INVITED: { message: "Invite only." },
  ADMIN_REQUIRED: { message: "You do not have permission to perform this action." },
  INVALID_CSRF_TOKEN: { message: "Invalid CSRF token." },
} as const satisfies ErrorCatalog<AuthErrorCode>;
