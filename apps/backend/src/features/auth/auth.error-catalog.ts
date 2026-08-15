// apps/backend/src/features/auth/auth.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { AuthErrorCode, SessionErrorCode } from "@minecraft-control-plane/shared/auth";
import { sessionErrorCatalog } from "./sessions/sessions.error-catalog.js";

const ownErrorCatalog = {
  UNAUTHENTICATED: { message: "Authentication required." },
  // The one message every login failure gets, whatever the cause — a
  // cause-specific message would let callers enumerate registered emails.
  AUTHENTICATION_FAILED: {
    message: "Sign-in failed. Make sure you're using the Google account that was given access.",
  },
  NOT_OWNER: { message: "Only the server owner can do this." },
  INVALID_CSRF_TOKEN: { message: "Invalid CSRF token." },
} as const satisfies ErrorCatalog<AuthErrorCode>;

// Aggregates the sub-features' catalogs, so `errors/catalog.ts` sees one entry
// per top-level feature (same shape as minecraft.error-catalog.ts).
export const authErrorCatalog = {
  ...ownErrorCatalog,
  ...sessionErrorCatalog,
} as const satisfies ErrorCatalog<AuthErrorCode | SessionErrorCode>;
