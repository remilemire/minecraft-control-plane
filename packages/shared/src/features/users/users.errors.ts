// packages/shared/src/features/users/users.errors.ts

import type { ErrorMeta } from "@/common/index.js";

export const userErrorMeta = {
  USER_NOT_FOUND: { kind: "NOT_FOUND" },
  EMAIL_TAKEN: { kind: "CONFLICT" },
} as const satisfies ErrorMeta;

export type UserErrorCode = keyof typeof userErrorMeta;
