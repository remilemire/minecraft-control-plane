// packages/shared/src/features/minecraft/clients/minecraft-clients.errors.ts

import type { ErrorMeta } from "@/common/index.js";

export const minecraftClientErrorMeta = {
  MOJANG_CLIENT_ERROR: { kind: "SERVICE_UNAVAILABLE" },
  RCON_CLIENT_ERROR: { kind: "SERVICE_UNAVAILABLE" },
} as const satisfies ErrorMeta;

export type MinecraftClientErrorCode = keyof typeof minecraftClientErrorMeta;
