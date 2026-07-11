// apps/backend/src/features/minecraft/clients/minecraft-client.error-meta.ts

import type { ErrorMeta } from "@/errors/meta-types.js";
import type { MinecraftClientErrorCode } from "@minecraft-server/shared/minecraft";

export const minecraftClientErrorMeta = {
  MOJANG_CLIENT_ERROR: { message: "Failed to reach Mojang's servers." },
  RCON_CLIENT_ERROR: { message: "Failed to reach the Minecraft server." },
} as const satisfies ErrorMeta<MinecraftClientErrorCode>;
