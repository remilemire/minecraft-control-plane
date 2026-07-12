// apps/frontend/src/features/minecraft/players/api.ts

import { apiRequest } from "@/lib/apiClient";
import {
  minecraftPlayerResponseSchema,
  setMinecraftPlayerSchema,
  type MinecraftPlayerResponse,
} from "@minecraft-server/shared/minecraft";
import { z } from "zod";

export type MinecraftPlayer = MinecraftPlayerResponse;

export function fetchMyPlayer(): Promise<MinecraftPlayer> {
  return apiRequest("GET", "/minecraft/players/me", { schema: minecraftPlayerResponseSchema });
}

export function setMyPlayer(username: string): Promise<MinecraftPlayer> {
  return apiRequest("PUT", "/minecraft/players/me", {
    schema: minecraftPlayerResponseSchema,
    body: setMinecraftPlayerSchema.parse({ username }),
  });
}

export function fetchPlayers(): Promise<MinecraftPlayer[]> {
  return apiRequest("GET", "/minecraft/players", {
    schema: z.array(minecraftPlayerResponseSchema),
  });
}

export function unlinkPlayer(userId: string): Promise<undefined> {
  return apiRequest("DELETE", `/minecraft/players/${userId}`);
}
