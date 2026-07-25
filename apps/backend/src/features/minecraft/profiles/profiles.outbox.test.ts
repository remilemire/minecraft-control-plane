// apps/backend/src/features/minecraft/profiles/profiles.outbox.test.ts

import type { MinecraftServerService } from "@/features/minecraft/server/server.service.js";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import type { MinecraftProfile } from "./profiles.schema.js";
import { WhitelistAddHandler, WhitelistRemoveHandler } from "./profiles.outbox.js";
import type { MinecraftProfileService } from "./profiles.service.js";

const PROFILE_ID = "00000000-0000-0000-0000-0000000000bb";

function profile(overrides: Partial<MinecraftProfile> = {}): MinecraftProfile {
  return {
    id: PROFILE_ID,
    username: "Steve",
    uuid: randomUUID(),
    whitelistStatus: "pending",
    ...overrides,
  };
}

// Services are classes (nominal via their private fields), so method-level
// stubs need the double cast.
function profileServiceStub(
  methods: Partial<Record<keyof MinecraftProfileService, unknown>>,
): MinecraftProfileService {
  return methods as unknown as MinecraftProfileService;
}

function serverServiceRecorder({ addFails = false } = {}) {
  const commands: string[] = [];
  const service = {
    addToWhitelist: async (username: string) => {
      commands.push(`add ${username}`);

      if (addFails) {
        throw new Error("rcon down");
      }
    },
    removeFromWhitelist: async (username: string) => {
      commands.push(`remove ${username}`);
    },
  } as unknown as MinecraftServerService;

  return { service, commands };
}

// The add handler owns the whitelist status, so its tests record what it wrote.
function statusRecorder(findById: () => Promise<MinecraftProfile | null>) {
  const written: string[] = [];
  const service = profileServiceStub({
    findById,
    markWhitelisted: async () => {
      written.push("whitelisted");
    },
    markWhitelistFailed: async () => {
      written.push("failed");
    },
  });

  return { service, written };
}

describe("WhitelistAddHandler", () => {
  it("whitelists the profile's current username and marks it whitelisted", async () => {
    const { service: serverService, commands } = serverServiceRecorder();
    const { service: profileService, written } = statusRecorder(async () =>
      profile({ username: "Steve" }),
    );
    const handler = new WhitelistAddHandler(profileService, serverService);

    await handler.handle({ minecraftProfileId: PROFILE_ID, username: "Steve" });

    expect(commands).toEqual(["add Steve"]);
    expect(written).toEqual(["whitelisted"]);
  });

  it("leaves the profile pending when the command does not land", async () => {
    const { service: serverService, commands } = serverServiceRecorder({ addFails: true });
    const { service: profileService, written } = statusRecorder(async () =>
      profile({ username: "Steve" }),
    );
    const handler = new WhitelistAddHandler(profileService, serverService);

    // Rethrown so the dispatcher retries with backoff; another attempt is
    // coming, so the status is left alone.
    await expect(
      handler.handle({ minecraftProfileId: PROFILE_ID, username: "Steve" }),
    ).rejects.toThrow("rcon down");

    expect(commands).toEqual(["add Steve"]);
    expect(written).toEqual([]);
  });

  it("marks the profile failed once the message dead-letters", async () => {
    const { service: serverService } = serverServiceRecorder({ addFails: true });
    const { service: profileService, written } = statusRecorder(async () =>
      profile({ username: "Steve" }),
    );
    const handler = new WhitelistAddHandler(profileService, serverService);

    await handler.onDeadLetter({ minecraftProfileId: PROFILE_ID, username: "Steve" });

    expect(written).toEqual(["failed"]);
  });

  it("no-ops when the profile was deleted since the message was enqueued", async () => {
    const { service: serverService, commands } = serverServiceRecorder();
    const { service: profileService, written } = statusRecorder(async () => null);
    const handler = new WhitelistAddHandler(profileService, serverService);

    await handler.handle({ minecraftProfileId: PROFILE_ID, username: "Steve" });

    expect(commands).toEqual([]);
    expect(written).toEqual([]);
  });
});

describe("WhitelistRemoveHandler", () => {
  it("removes the username while nobody owns it", async () => {
    const { service, commands } = serverServiceRecorder();
    const handler = new WhitelistRemoveHandler(
      profileServiceStub({ findByUsername: async () => null }),
      service,
    );

    await handler.handle({ minecraftProfileId: PROFILE_ID, username: "Steve" });

    expect(commands).toEqual(["remove Steve"]);
  });

  it("no-ops when the username was re-added as a new profile meanwhile", async () => {
    const { service, commands } = serverServiceRecorder();
    const handler = new WhitelistRemoveHandler(
      profileServiceStub({
        findByUsername: async () => profile({ id: randomUUID(), username: "Steve" }),
      }),
      service,
    );

    await handler.handle({ minecraftProfileId: PROFILE_ID, username: "Steve" });

    expect(commands).toEqual([]);
  });
});
