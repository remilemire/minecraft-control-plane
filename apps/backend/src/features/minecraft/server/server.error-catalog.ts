// apps/backend/src/features/minecraft/server/server.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { MinecraftServerErrorCode } from "@minecraft-control-plane/shared/minecraft";

export const minecraftServerErrorCatalog =
  {} as const satisfies ErrorCatalog<MinecraftServerErrorCode>;
