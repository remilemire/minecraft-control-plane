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

function serverServiceRecorder() {
  const commands: string[] = [];
  const service = {
    addToWhitelist: async (username: string) => {
      commands.push(`add ${username}`);
    },
    removeFromWhitelist: async (username: string) => {
      commands.push(`remove ${username}`);
    },
  } as unknown as MinecraftServerService;

  return { service, commands };
}

describe("WhitelistAddHandler", () => {
  it("whitelists the profile's current username while it still exists", async () => {
    const { service, commands } = serverServiceRecorder();
    const handler = new WhitelistAddHandler(
      profileServiceStub({ findById: async () => profile({ username: "Steve" }) }),
      service,
    );

    await handler.handle({ minecraftProfileId: PROFILE_ID, username: "Steve" });

    expect(commands).toEqual(["add Steve"]);
  });

  it("no-ops when the profile was deleted since the message was enqueued", async () => {
    const { service, commands } = serverServiceRecorder();
    const handler = new WhitelistAddHandler(
      profileServiceStub({ findById: async () => null }),
      service,
    );

    await handler.handle({ minecraftProfileId: PROFILE_ID, username: "Steve" });

    expect(commands).toEqual([]);
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
