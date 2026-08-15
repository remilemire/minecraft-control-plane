// apps/backend/src/errors/catalog.ts

import { authErrorCatalog } from "@/features/auth/auth.error-catalog.js";
import { minecraftErrorCatalog } from "@/features/minecraft/minecraft.error-catalog.js";
import { userErrorCatalog } from "@/features/users/users.error-catalog.js";
import type { CommonErrorCode } from "@minecraft-control-plane/shared/common";
import type { ErrorCatalog } from "./catalog-contracts.js";

const commonErrorCatalog = {
  INTERNAL: { message: "Something went wrong." },
  ROUTE_NOT_FOUND: { message: "No such API route." },
  SERVICE_UNAVAILABLE: { message: "The service is temporarily unavailable." },
  VALIDATION_FAILED: { message: "Validation failed." },
} as const satisfies ErrorCatalog<CommonErrorCode>;

export const errorCatalog = {
  ...commonErrorCatalog,
  ...authErrorCatalog,
  ...minecraftErrorCatalog,
  ...userErrorCatalog,
} as const satisfies ErrorCatalog;
