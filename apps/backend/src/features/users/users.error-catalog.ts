// apps/backend/src/features/users/users.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { UserErrorCode } from "@minecraft-control-plane/shared/users";

export const userErrorCatalog = {
  USER_NOT_FOUND: { message: "User not found." },
  EMAIL_TAKEN: { message: "This email is already in use." },
  OWNER_ALREADY_EXISTS: { message: "There is already an owner." },
  CANNOT_TRANSFER_TO_SELF: { message: "You already own this server." },
} as const satisfies ErrorCatalog<UserErrorCode>;
