// apps/backend/test/helpers/factories/minecraft-profile.factory.ts

import { db } from "@/infrastructure/db/index.js";
import {
  minecraftProfiles,
  type MinecraftProfile,
  type NewMinecraftProfile,
} from "@/infrastructure/db/schemas.js";
import { randomUUID } from "crypto";

let sequence = 0;

export async function createMinecraftProfile(
  overrides: Partial<NewMinecraftProfile> = {},
): Promise<MinecraftProfile> {
  const n = ++sequence;

  const [minecraftProfile] = await db
    .insert(minecraftProfiles)
    .values({
      username: `Player${n}`,
      uuid: randomUUID(),
      ...overrides,
    })
    .returning();

  if (minecraftProfile === undefined) {
    throw new Error("createMinecraftProfile: insert returned no row.");
  }

  return minecraftProfile;
}
