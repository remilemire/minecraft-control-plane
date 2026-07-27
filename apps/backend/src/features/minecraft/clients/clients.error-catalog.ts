// apps/backend/src/features/minecraft/clients/clients.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { MinecraftClientErrorCode } from "@minecraft-server/shared/minecraft";

export const minecraftClientErrorCatalog = {
  MOJANG_CLIENT_ERROR: { message: "Failed to reach Mojang's servers." },
  PROCESS_CLIENT_ERROR: { message: "Failed to reach the Minecraft server controller." },
  RCON_CLIENT_ERROR: { message: "Failed to reach the Minecraft server." },
} as const satisfies ErrorCatalog<MinecraftClientErrorCode>;
