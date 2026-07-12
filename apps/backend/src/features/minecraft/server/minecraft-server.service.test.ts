// apps/backend/src/features/minecraft/server/minecraft-server.service.test.ts

import { AppError } from "@/errors/app-error.js";
import type { MinecraftProfile } from "@/db/schema/index.js";
import { FakeProcessClient } from "@test/fakes/fake-process.client.js";
import { FakeRconClient } from "@test/fakes/fake-rcon.client.js";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import type { MinecraftProfileService } from "../profiles/minecraft-profiles.service.js";
import { MinecraftServerService } from "./minecraft-server.service.js";

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

// The profile service is a class (nominal because of its private fields), so
// method-level stubs need the double cast.
function profileServiceStub(
  methods: Partial<Record<keyof MinecraftProfileService, unknown>>,
): MinecraftProfileService {
  return methods as unknown as MinecraftProfileService;
}

describe("MinecraftServerService", () => {
  it("whitelists the profile username of the given user", async () => {
    const rcon = new FakeRconClient();
    let lookedUpUserId: string | undefined;
    const service = new MinecraftServerService(
      profileServiceStub({
        getByUserId: async (userId: string) => {
          lookedUpUserId = userId;
          return profile({ username: "Notch" });
        },
      }),
      rcon,
      new FakeProcessClient(),
    );

    await service.addToWhitelist(USER_ID);

    expect(lookedUpUserId).toBe(USER_ID);
    expect(rcon.executed).toEqual(["whitelist add Notch"]);
  });

  it("removes the profile username from the whitelist", async () => {
    const rcon = new FakeRconClient();
    const service = new MinecraftServerService(
      profileServiceStub({ getByUserId: async () => profile({ username: "Notch" }) }),
      rcon,
      new FakeProcessClient(),
    );

    await service.removeFromWhitelist(USER_ID);

    expect(rcon.executed).toEqual(["whitelist remove Notch"]);
  });

  it("propagates MINECRAFT_PROFILE_NOT_FOUND when the user has no profile", async () => {
    const rcon = new FakeRconClient();
    const service = new MinecraftServerService(
      profileServiceStub({
        getByUserId: async () => {
          throw new AppError("MINECRAFT_PROFILE_NOT_FOUND");
        },
      }),
      rcon,
      new FakeProcessClient(),
    );

    await expect(service.addToWhitelist(USER_ID)).rejects.toMatchObject({
      code: "MINECRAFT_PROFILE_NOT_FOUND",
    });
    // No rcon command should run when the profile lookup fails.
    expect(rcon.executed).toEqual([]);
  });

  it("delegates start/stop/restart/status to the process client", async () => {
    const process = new FakeProcessClient();
    const service = new MinecraftServerService(
      profileServiceStub({}),
      new FakeRconClient(),
      process,
    );

    await service.start();
    await service.stop();
    await service.restart();

    expect(process.calls).toEqual(["start", "stop", "restart"]);
    // restart leaves the fake RUNNING.
    expect(await service.getStatus()).toBe("RUNNING");
  });

  it("lists players via the rcon list command", async () => {
    const rcon = new FakeRconClient();
    rcon.respondTo("list", "There are 0 of a max of 20 players online:");
    const service = new MinecraftServerService(
      profileServiceStub({}),
      rcon,
      new FakeProcessClient(),
    );

    expect(await service.listPlayers()).toEqual({ online: 0, maximum: 20, players: [] });
    expect(rcon.executed).toEqual(["list"]);
  });

  it("parses the player names from a non-empty rcon list response", async () => {
    const rcon = new FakeRconClient();
    rcon.respondTo("list", "There are 2 of a max of 20 players online: Steve, Alex");
    const service = new MinecraftServerService(
      profileServiceStub({}),
      rcon,
      new FakeProcessClient(),
    );

    expect(await service.listPlayers()).toEqual({
      online: 2,
      maximum: 20,
      players: ["Steve", "Alex"],
    });
  });
});
