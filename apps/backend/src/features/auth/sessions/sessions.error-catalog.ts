// apps/backend/src/features/auth/sessions/sessions.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { SessionErrorCode } from "@minecraft-control-plane/shared/auth";

export const sessionErrorCatalog = {
  SESSION_NOT_FOUND: { message: "Session not found." },
  INVALID_SESSION: { message: "Invalid or expired session." },
} as const satisfies ErrorCatalog<SessionErrorCode>;
