// apps/backend/src/features/minecraft/minecraft.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import { minecraftClientErrorCatalog } from "./clients/clients.error-catalog.js";
import { minecraftProfileErrorCatalog } from "./profiles/profiles.error-catalog.js";
import { minecraftServerErrorCatalog } from "./server/server.error-catalog.js";
import type {
  MinecraftClientErrorCode,
  MinecraftProfileErrorCode,
  MinecraftServerErrorCode,
} from "@minecraft-control-plane/shared/minecraft";

export const minecraftErrorCatalog = {
  ...minecraftClientErrorCatalog,
  ...minecraftProfileErrorCatalog,
  ...minecraftServerErrorCatalog,
} as const satisfies ErrorCatalog<
  MinecraftClientErrorCode | MinecraftProfileErrorCode | MinecraftServerErrorCode
>;
