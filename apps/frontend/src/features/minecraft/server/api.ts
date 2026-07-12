// apps/frontend/src/features/minecraft/server/api.ts

import { apiRequest } from "@/lib/apiClient";
import {
  minecraftServerStatusResponseSchema,
  type MinecraftServerStatus,
} from "@minecraft-server/shared/minecraft";

export type { MinecraftServerStatus };

export async function fetchServerStatus(): Promise<MinecraftServerStatus> {
  const { status } = await apiRequest("GET", "/minecraft/server/status", {
    schema: minecraftServerStatusResponseSchema,
  });
  return status;
}

export function startServer(): Promise<undefined> {
  return apiRequest("POST", "/minecraft/server/start");
}

export function stopServer(): Promise<undefined> {
  return apiRequest("POST", "/minecraft/server/stop");
}

export function restartServer(): Promise<undefined> {
  return apiRequest("POST", "/minecraft/server/restart");
}
