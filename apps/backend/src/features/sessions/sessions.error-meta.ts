// apps/backend/src/features/sessions/sessions.error-meta.ts

import type { ErrorMeta } from "@/errors/meta-types.js";
import type { SessionErrorCode } from "@minecraft-server/shared/sessions";

export const sessionErrorMeta = {
  SESSION_NOT_FOUND: { message: "Session not found." },
} as const satisfies ErrorMeta<SessionErrorCode>;
