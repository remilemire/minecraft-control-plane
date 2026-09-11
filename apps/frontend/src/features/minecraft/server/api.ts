// apps/frontend/src/features/minecraft/server/api.ts

import { apiRequest } from "@/lib/apiClient";
import {
  minecraftServerStatusResponseSchema,
  type MinecraftServerStatusResponse,
} from "@minecraft-control-plane/shared/minecraft";

export type { MinecraftServerStatusResponse };

export async function fetchServerStatus(): Promise<MinecraftServerStatusResponse> {
  return apiRequest("GET", "/minecraft/server/status", {
    schema: minecraftServerStatusResponseSchema,
  });
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
