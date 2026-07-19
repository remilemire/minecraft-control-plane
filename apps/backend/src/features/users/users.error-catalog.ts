// apps/backend/src/features/users/users.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { UserErrorCode } from "@minecraft-server/shared/users";

export const userErrorCatalog = {
  USER_NOT_FOUND: { message: "User not found." },
  GOOGLE_ID_TAKEN: { message: "This Google account is already linked to a user." },
  EMAIL_TAKEN: { message: "This email is already in use." },
} as const satisfies ErrorCatalog<UserErrorCode>;
