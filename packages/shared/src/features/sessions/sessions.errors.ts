// packages/shared/src/features/sessions/sessions.errors.ts

import type { ErrorCatalog } from "../../common/errors.js";

export const sessionErrorCatalog = {
  SESSION_NOT_FOUND: { kind: "NOT_FOUND" },
} as const satisfies ErrorCatalog;

export type SessionErrorCode = keyof typeof sessionErrorCatalog;
