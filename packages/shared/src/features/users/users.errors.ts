// packages/shared/src/features/users/users.errors.ts

import type { ErrorCatalog } from "../../common/errors.js";

export const userErrorCatalog = {
  USER_NOT_FOUND: { kind: "NOT_FOUND" },
} as const satisfies ErrorCatalog;

export type UserErrorCode = keyof typeof userErrorCatalog;
