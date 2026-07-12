// apps/backend/src/features/users/users.error-meta.ts

import type { ErrorMeta } from "@/errors/meta-types.js";
import type { UserErrorCode } from "@minecraft-server/shared/users";

export const userErrorMeta = {
  USER_NOT_FOUND: { message: "User not found." },
  GOOGLE_ID_TAKEN: { message: "This Google account is already linked to a user." },
  EMAIL_TAKEN: { message: "This email is already in use." },
} as const satisfies ErrorMeta<UserErrorCode>;
