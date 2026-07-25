// apps/backend/src/features/minecraft/profiles/profiles.repository.ts

import { withDbErrors, type DatabaseProvider } from "@/infrastructure/db/index.js";
import { AppError } from "@/errors/app-error.js";
import type { WhitelistStatus } from "@minecraft-server/shared/minecraft";
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

  public async findById(id: string): Promise<MinecraftProfile | null> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .select()
        .from(minecraftProfiles)
        .where(eq(minecraftProfiles.id, id))
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

  // A username or uuid already present surfaces as a unique violation ->
  // the mapped conflict error.
  public async create(
    input: Pick<NewMinecraftProfile, "username" | "uuid">,
  ): Promise<MinecraftProfile> {
    const [minecraftProfile] = await withDbErrors(
      () => this.databaseProvider.get().insert(minecraftProfiles).values(input).returning(),
      {
        [MINECRAFT_PROFILES_CONSTRAINTS.USERNAME_UNIQUE]: "MINECRAFT_USERNAME_TAKEN",
        [MINECRAFT_PROFILES_CONSTRAINTS.UUID_UNIQUE]: "MINECRAFT_ACCOUNT_TAKEN",
      },
    );

    if (minecraftProfile === undefined) {
      throw new AppError("SERVICE_UNAVAILABLE", { message: "Failed to create Minecraft profile." });
    }

    return minecraftProfile;
  }

  // Returns null when the profile is gone (deleted between the read and this
  // write), which the whitelist handlers treat as a no-op.
  public async updateWhitelistStatus(
    id: string,
    whitelistStatus: WhitelistStatus,
  ): Promise<MinecraftProfile | null> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .update(minecraftProfiles)
        .set({ whitelistStatus })
        .where(eq(minecraftProfiles.id, id))
        .returning(),
    );

    return minecraftProfile ?? null;
  }

  public async deleteById(id: string): Promise<MinecraftProfile | null> {
    const [minecraftProfile] = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .delete(minecraftProfiles)
        .where(eq(minecraftProfiles.id, id))
        .returning(),
    );

    return minecraftProfile ?? null;
  }
}
