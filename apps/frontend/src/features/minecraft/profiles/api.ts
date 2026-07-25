// apps/frontend/src/features/minecraft/profiles/api.ts

import { apiRequest } from "@/lib/apiClient";
import {
  createMinecraftProfileSchema,
  minecraftProfileResponseSchema,
  type MinecraftProfileResponse,
} from "@minecraft-server/shared/minecraft";
import { z } from "zod";

export type MinecraftProfile = MinecraftProfileResponse;

export function fetchProfiles(): Promise<MinecraftProfile[]> {
  return apiRequest("GET", "/minecraft/profiles", {
    schema: z.array(minecraftProfileResponseSchema),
  });
}

// The whitelist command applies asynchronously (outbox), moments after the
// response — the profile comes back with `online: false`.
export function createProfile(username: string): Promise<MinecraftProfile> {
  return apiRequest("POST", "/minecraft/profiles", {
    schema: minecraftProfileResponseSchema,
    body: createMinecraftProfileSchema.parse({ username }),
  });
}

export function deleteProfile(minecraftProfileId: string): Promise<undefined> {
  return apiRequest("DELETE", `/minecraft/profiles/${minecraftProfileId}`);
}
