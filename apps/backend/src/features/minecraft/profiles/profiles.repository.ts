// apps/backend/src/features/minecraft/profiles/profiles.repository.ts

import { withDbErrors, type DatabaseProvider } from "@/infrastructure/db/index.js";
import { AppError } from "@/errors/app-error.js";
import { eq } from "drizzle-orm";
import { MINECRAFT_PROFILES_CONSTRAINTS } from "./profiles.constraints.js";
import {
  minecraftProfiles,
  type MinecraftProfile,
  type NewMinecraftProfile,
} from "./profiles.schema.js";

export class MinecraftProfileRepository {
  public constructor(private readonly databaseProvider: DatabaseProvider) {}

  public async findAll(): Promise<MinecraftProfile[]> {
    return withDbErrors(() => this.databaseProvider.get().select().from(minecraftProfiles));
  }

  public async findByUserId(userId: string): Promise<MinecraftProfile | null> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .select()
        .from(minecraftProfiles)
        .where(eq(minecraftProfiles.userId, userId))
        .limit(1),
    );

    return minecraftProfile ?? null;
  }

  public async findByUsername(username: string): Promise<MinecraftProfile | null> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .select()
        .from(minecraftProfiles)
        .where(eq(minecraftProfiles.username, username))
        .limit(1),
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
    const [minecraftProfile] = await withDbErrors(
      () =>
        this.databaseProvider
          .get()
          .insert(minecraftProfiles)
          .values({ userId, ...input })
          .onConflictDoUpdate({ target: minecraftProfiles.userId, set: input })
          .returning(),
      {
        [MINECRAFT_PROFILES_CONSTRAINTS.USERNAME_UNIQUE]: "MINECRAFT_USERNAME_TAKEN",
        [MINECRAFT_PROFILES_CONSTRAINTS.UUID_UNIQUE]: "MINECRAFT_ACCOUNT_TAKEN",
      },
    );

    if (minecraftProfile === undefined) {
      throw new AppError("SERVICE_UNAVAILABLE", { message: "Failed to upsert Minecraft profile." });
    }

    return minecraftProfile;
  }

  public async deleteByUserId(userId: string): Promise<MinecraftProfile | null> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .delete(minecraftProfiles)
        .where(eq(minecraftProfiles.userId, userId))
        .returning(),
    );

    return minecraftProfile ?? null;
  }
}
