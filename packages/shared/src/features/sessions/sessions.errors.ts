// packages/shared/src/features/sessions/sessions.errors.ts

import type { ErrorMeta } from "@/common/index.js";

export const sessionErrorMeta = {
  SESSION_NOT_FOUND: { kind: "NOT_FOUND" },
} as const satisfies ErrorMeta;

export type SessionErrorCode = keyof typeof sessionErrorMeta;
