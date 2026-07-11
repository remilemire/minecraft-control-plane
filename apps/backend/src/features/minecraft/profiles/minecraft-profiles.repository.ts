// apps/backend/src/features/minecraft/profiles/minecraft-profiles.repository.ts

import type { Db } from "@/db/client.js";
import { withDbErrors } from "@/db/errors.js";
import {
  minecraftProfiles,
  type MinecraftProfile,
  type NewMinecraftProfile,
} from "@/db/schema/minecraft-profile.js";
import { AppError } from "@/errors/app-error.js";
import { eq } from "drizzle-orm";

export class MinecraftProfileRepository {
  public constructor(private readonly db: Db) {}

  public async findAll(): Promise<MinecraftProfile[]> {
    return withDbErrors(() => this.db.select().from(minecraftProfiles));
  }

  public async findByUserId(userId: string): Promise<MinecraftProfile | null> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.db.select().from(minecraftProfiles).where(eq(minecraftProfiles.userId, userId)).limit(1),
    );

    return minecraftProfile ?? null;
  }

  // Create-or-replace by userId. A conflict on userId updates the existing row;
  // a conflict on the username or uuid unique constraints (i.e. taken by
  // another user) surfaces as a unique violation -> AlreadyExistsError.
  public async upsertByUserId(
    userId: string,
    input: Pick<NewMinecraftProfile, "username" | "uuid">,
  ): Promise<MinecraftProfile> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.db
        .insert(minecraftProfiles)
        .values({ userId, ...input })
        .onConflictDoUpdate({ target: minecraftProfiles.userId, set: input })
        .returning(),
    );

    if (minecraftProfile === undefined) {
      throw new AppError("INTERNAL", { message: "Failed to upsert Minecraft profile." });
    }

    return minecraftProfile;
  }

  public async deleteByUserId(userId: string): Promise<MinecraftProfile | null> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.db.delete(minecraftProfiles).where(eq(minecraftProfiles.userId, userId)).returning(),
    );

    return minecraftProfile ?? null;
  }
}
