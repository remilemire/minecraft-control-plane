// apps/backend/src/features/minecraft/profiles/profiles.repository.integration.test.ts

import { db } from "@/infrastructure/db/client.js";
import { DatabaseProvider } from "@/infrastructure/db/provider.js";
import { createMinecraftProfile } from "@test/helpers/factories/minecraft-profile.factory.js";
import { createUser } from "@test/helpers/factories/user.factory.js";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { MinecraftProfileRepository } from "./profiles.repository.js";

describe("MinecraftProfileRepository", () => {
  const repository = new MinecraftProfileRepository(new DatabaseProvider(db));

  describe("upsertByUserId", () => {
    it("inserts a profile for a user without one", async () => {
      const user = await createUser();
      const uuid = randomUUID();

      const created = await repository.upsertByUserId(user.id, { username: "Steve", uuid });

      expect(created).toMatchObject({ username: "Steve", uuid, userId: user.id });
      expect(created.id).toBeDefined();
    });

    it("replaces the profile when the user already has one", async () => {
      const user = await createUser();
      const existing = await createMinecraftProfile({ userId: user.id, username: "OldName" });
      const newUuid = randomUUID();

      const updated = await repository.upsertByUserId(user.id, {
        username: "NewName",
        uuid: newUuid,
      });

      // Same row (upsert on userId), new contents.
      expect(updated.id).toBe(existing.id);
      expect(updated.username).toBe("NewName");
      expect(updated.uuid).toBe(newUuid);
    });

    it("maps a username taken by another user to MINECRAFT_USERNAME_TAKEN", async () => {
      await createMinecraftProfile({ username: "Steve" });
      const other = await createUser();

      await expect(
        repository.upsertByUserId(other.id, { username: "Steve", uuid: randomUUID() }),
      ).rejects.toMatchObject({ code: "MINECRAFT_USERNAME_TAKEN" });
    });

    it("maps a uuid taken by another user to MINECRAFT_ACCOUNT_TAKEN", async () => {
      const existing = await createMinecraftProfile({ username: "Steve" });
      const other = await createUser();

      await expect(
        repository.upsertByUserId(other.id, { username: "Alex", uuid: existing.uuid }),
      ).rejects.toMatchObject({ code: "MINECRAFT_ACCOUNT_TAKEN" });
    });
  });

  it("finds a profile by user id", async () => {
    const created = await createMinecraftProfile();

    expect(await repository.findByUserId(created.userId)).toEqual(created);
    expect(await repository.findByUserId(randomUUID())).toBeNull();
  });

  it("deletes by user id and returns the removed profile", async () => {
    const created = await createMinecraftProfile();

    expect(await repository.deleteByUserId(created.userId)).toEqual(created);
    expect(await repository.findByUserId(created.userId)).toBeNull();
    expect(await repository.deleteByUserId(randomUUID())).toBeNull();
  });
});
