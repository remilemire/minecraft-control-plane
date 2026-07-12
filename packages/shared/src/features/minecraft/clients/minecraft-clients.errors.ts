// packages/shared/src/features/minecraft/clients/minecraft-clients.errors.ts

import type { ErrorCatalog } from "@/common/index.js";

export const minecraftClientErrorCatalog = {
  MOJANG_CLIENT_ERROR: { kind: "SERVICE_UNAVAILABLE" },
  RCON_CLIENT_ERROR: { kind: "SERVICE_UNAVAILABLE" },
} as const satisfies ErrorCatalog;

export type MinecraftClientErrorCode = keyof typeof minecraftClientErrorCatalog;
