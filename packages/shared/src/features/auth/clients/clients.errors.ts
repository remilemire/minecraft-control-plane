// packages/shared/src/features/auth/clients/clients.errors.ts

import type { ErrorMeta } from "@/common/index.js";

export const authClientErrorMeta = {
  INVALID_GOOGLE_CREDENTIAL: { kind: "UNAUTHORIZED" },
} as const satisfies ErrorMeta;

export type AuthClientErrorCode = keyof typeof authClientErrorMeta;
