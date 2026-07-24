// apps/backend/src/features/minecraft/profiles/profiles.service.test.ts

import type { MinecraftProfile, NewMinecraftProfile } from "./profiles.schema.js";
import { FakeMojangClient } from "@test/fakes/fake-mojang.client.js";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import type { MinecraftProfileRepository } from "./profiles.repository.js";
import { MinecraftProfileService } from "./profiles.service.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";

function profile(overrides: Partial<MinecraftProfile> = {}): MinecraftProfile {
  return {
    id: "00000000-0000-0000-0000-0000000000bb",
    username: "Steve",
    uuid: randomUUID(),
    userId: USER_ID,
    ...overrides,
  };
}

// The repository is a class (nominal because of its private db field), so
// method-level stubs need the double cast.
function repositoryStub(
  methods: Partial<Record<keyof MinecraftProfileRepository, unknown>>,
): MinecraftProfileRepository {
  return methods as unknown as MinecraftProfileRepository;
}

describe("MinecraftProfileService", () => {
  describe("getByUserId", () => {
    it("returns the profile when the user has one", async () => {
      const existing = profile();
      const service = new MinecraftProfileService(
        repositoryStub({ findByUserId: async () => existing }),
        new FakeMojangClient(),
      );

      expect(await service.getByUserId(USER_ID)).toEqual(existing);
    });

    it("throws MINECRAFT_PROFILE_NOT_FOUND when the user has no profile", async () => {
      const service = new MinecraftProfileService(
        repositoryStub({ findByUserId: async () => null }),
        new FakeMojangClient(),
      );

      await expect(service.getByUserId(USER_ID)).rejects.toMatchObject({
        code: "MINECRAFT_PROFILE_NOT_FOUND",
      });
    });
  });

  describe("resolveUsername", () => {
    it("resolves the uuid and canonical username from Mojang", async () => {
      const mojang = new FakeMojangClient();
      const uuid = randomUUID();
      mojang.setProfile({ username: "Steve", uuid });

      const service = new MinecraftProfileService(repositoryStub({}), mojang);

      // The caller supplies a differently-cased username.
      expect(await service.resolveUsername("steve")).toEqual({ username: "Steve", uuid });
    });

    it("throws MOJANG_PROFILE_NOT_FOUND when Mojang has no such account", async () => {
      const service = new MinecraftProfileService(repositoryStub({}), new FakeMojangClient());

      await expect(service.resolveUsername("Ghost")).rejects.toMatchObject({
        code: "MOJANG_PROFILE_NOT_FOUND",
      });
    });
  });

  describe("setByUserId", () => {
    it("upserts the resolved profile for the user", async () => {
      const uuid = randomUUID();

      let upsertArgs:
        | { userId: string; input: Pick<NewMinecraftProfile, "username" | "uuid"> }
        | undefined;
      const service = new MinecraftProfileService(
        repositoryStub({
          upsertByUserId: async (
            userId: string,
            input: Pick<NewMinecraftProfile, "username" | "uuid">,
          ) => {
            upsertArgs = { userId, input };
            return profile({ username: input.username, uuid: input.uuid });
          },
        }),
        new FakeMojangClient(),
      );

      const result = await service.setByUserId(USER_ID, { username: "Steve", uuid });

      expect(upsertArgs).toEqual({ userId: USER_ID, input: { username: "Steve", uuid } });
      expect(result).toMatchObject({ username: "Steve", uuid });
    });
  });

  describe("deleteByUserId", () => {
    it("returns the removed profile", async () => {
      const removed = profile();
      const service = new MinecraftProfileService(
        repositoryStub({ deleteByUserId: async () => removed }),
        new FakeMojangClient(),
      );

      expect(await service.deleteByUserId(USER_ID)).toEqual(removed);
    });

    it("throws MINECRAFT_PROFILE_NOT_FOUND when the user has no profile", async () => {
      const service = new MinecraftProfileService(
        repositoryStub({ deleteByUserId: async () => null }),
        new FakeMojangClient(),
      );

      await expect(service.deleteByUserId(USER_ID)).rejects.toMatchObject({
        code: "MINECRAFT_PROFILE_NOT_FOUND",
      });
    });
  });
});
