// apps/backend/src/features/auth/clients/clients.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { AuthClientErrorCode } from "@minecraft-control-plane/shared/auth";

export const authClientErrorCatalog = {
  INVALID_GOOGLE_CREDENTIAL: { message: "The Google credential is invalid or expired." },
} as const satisfies ErrorCatalog<AuthClientErrorCode>;
