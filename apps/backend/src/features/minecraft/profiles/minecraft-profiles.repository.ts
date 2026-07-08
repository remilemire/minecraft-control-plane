// apps/backend/src/features/minecraft/profiles/minecraft-profiles.repository.ts

import type { Db } from "@/db/client.js";
import { DbError, withDbErrors } from "@/db/errors.js";
import {
  minecraftProfiles,
  type MinecraftProfile,
  type NewMinecraftProfile,
} from "@/db/schema/minecraft-profile.js";
import { eq } from "drizzle-orm";

export class MinecraftProfileRepository {
  public constructor(private readonly db: Db) {}

  public async findByUserId(userId: string): Promise<MinecraftProfile | null> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.db.select().from(minecraftProfiles).where(eq(minecraftProfiles.userId, userId)).limit(1),
    );

    return minecraftProfile ?? null;
  }

  public async create(input: NewMinecraftProfile): Promise<MinecraftProfile> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.db.insert(minecraftProfiles).values(input).returning(),
    );

    if (minecraftProfile === undefined) {
      throw new DbError("Failed to create Minecraft profile.");
    }

    return minecraftProfile;
  }

  public async updateByUserId(
    userId: string,
    input: Partial<MinecraftProfile>,
  ): Promise<MinecraftProfile | null> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.db
        .update(minecraftProfiles)
        .set(input)
        .where(eq(minecraftProfiles.userId, userId))
        .returning(),
    );

    return minecraftProfile ?? null;
  }

  public async deleteByUserId(userId: string): Promise<MinecraftProfile | null> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.db.delete(minecraftProfiles).where(eq(minecraftProfiles.userId, userId)).returning(),
    );

    return minecraftProfile ?? null;
  }
}
