// apps/backend/src/features/sessions/sessions.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { SessionErrorCode } from "@minecraft-server/shared/sessions";

export const sessionErrorCatalog = {
  SESSION_NOT_FOUND: { message: "Session not found." },
} as const satisfies ErrorCatalog<SessionErrorCode>;
