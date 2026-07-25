// apps/backend/src/features/minecraft/profiles/profiles.repository.integration.test.ts

import { db, DatabaseProvider } from "@/infrastructure/db/index.js";
import { createMinecraftProfile } from "@test/helpers/factories/minecraft-profile.factory.js";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { MinecraftProfileRepository } from "./profiles.repository.js";

describe("MinecraftProfileRepository", () => {
  const repository = new MinecraftProfileRepository(new DatabaseProvider(db));

  describe("create", () => {
    it("inserts a profile", async () => {
      const uuid = randomUUID();

      const created = await repository.create({ username: "Steve", uuid });

      // Whitelisting runs through the outbox after commit, so a new row starts
      // out pending.
      expect(created).toMatchObject({ username: "Steve", uuid, whitelistStatus: "pending" });
      expect(created.id).toBeDefined();
    });

    it("maps a taken username to MINECRAFT_USERNAME_TAKEN", async () => {
      await createMinecraftProfile({ username: "Steve" });

      await expect(
        repository.create({ username: "Steve", uuid: randomUUID() }),
      ).rejects.toMatchObject({ code: "MINECRAFT_USERNAME_TAKEN" });
    });

    it("maps a taken uuid to MINECRAFT_ACCOUNT_TAKEN", async () => {
      const existing = await createMinecraftProfile({ username: "Steve" });

      await expect(
        repository.create({ username: "Alex", uuid: existing.uuid }),
      ).rejects.toMatchObject({ code: "MINECRAFT_ACCOUNT_TAKEN" });
    });
  });

  it("finds a profile by id", async () => {
    const created = await createMinecraftProfile();

    expect(await repository.findById(created.id)).toEqual(created);
    expect(await repository.findById(randomUUID())).toBeNull();
  });

  it("finds a profile by username", async () => {
    const created = await createMinecraftProfile({ username: "Steve" });

    expect(await repository.findByUsername("Steve")).toEqual(created);
    expect(await repository.findByUsername("Ghost")).toBeNull();
  });

  it("updates the whitelist status, and returns null for a profile that is gone", async () => {
    const created = await createMinecraftProfile();

    const updated = await repository.updateWhitelistStatus(created.id, "whitelisted");

    expect(updated).toMatchObject({ id: created.id, whitelistStatus: "whitelisted" });
    expect(await repository.updateWhitelistStatus(randomUUID(), "failed")).toBeNull();
  });

  it("deletes by id and returns the removed profile", async () => {
    const created = await createMinecraftProfile();

    expect(await repository.deleteById(created.id)).toEqual(created);
    expect(await repository.findById(created.id)).toBeNull();
    expect(await repository.deleteById(randomUUID())).toBeNull();
  });
});
