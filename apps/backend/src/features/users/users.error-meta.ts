// apps/backend/src/features/users/users.error-meta.ts

import type { ErrorMeta } from "@/errors/meta-types.js";
import type { UserErrorCode } from "@minecraft-server/shared/users";

export const userErrorMeta = {
  USER_NOT_FOUND: { message: "User not found." },
} as const satisfies ErrorMeta<UserErrorCode>;
