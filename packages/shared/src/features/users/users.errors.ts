// packages/shared/src/features/users/users.errors.ts

import type { ErrorCatalog } from "@/common/index.js";

export const userErrorCatalog = {
  USER_NOT_FOUND: { kind: "NOT_FOUND" },
  GOOGLE_ID_TAKEN: { kind: "CONFLICT" },
  EMAIL_TAKEN: { kind: "CONFLICT" },
} as const satisfies ErrorCatalog;

export type UserErrorCode = keyof typeof userErrorCatalog;
