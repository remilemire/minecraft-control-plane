// apps/backend/src/features/minecraft/players/players.outbox.test.ts

import type { MinecraftProfile } from "@/infrastructure/db/schemas.js";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import type { MinecraftProfileService } from "@/features/minecraft/profiles/profiles.service.js";
import type { MinecraftServerService } from "@/features/minecraft/server/server.service.js";
import { WhitelistAddHandler, WhitelistRemoveHandler } from "./players.outbox.js";

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
  it("whitelists the username while the profile still matches", async () => {
    const { service, commands } = serverServiceRecorder();
    const handler = new WhitelistAddHandler(
      profileServiceStub({ findByUserId: async () => profile({ username: "Steve" }) }),
      service,
    );

    await handler.handle({ userId: USER_ID, username: "Steve" });

    expect(commands).toEqual(["add Steve"]);
  });

  it("no-ops when the user unlinked since the message was enqueued", async () => {
    const { service, commands } = serverServiceRecorder();
    const handler = new WhitelistAddHandler(
      profileServiceStub({ findByUserId: async () => null }),
      service,
    );

    await handler.handle({ userId: USER_ID, username: "Steve" });

    expect(commands).toEqual([]);
  });

  it("no-ops when the user re-linked a different username", async () => {
    const { service, commands } = serverServiceRecorder();
    const handler = new WhitelistAddHandler(
      profileServiceStub({ findByUserId: async () => profile({ username: "NewName" }) }),
      service,
    );

    await handler.handle({ userId: USER_ID, username: "Steve" });

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

    await handler.handle({ userId: USER_ID, username: "Steve" });

    expect(commands).toEqual(["remove Steve"]);
  });

  it("no-ops when the username was re-linked (by anyone) meanwhile", async () => {
    const { service, commands } = serverServiceRecorder();
    const handler = new WhitelistRemoveHandler(
      profileServiceStub({
        findByUsername: async () => profile({ userId: randomUUID(), username: "Steve" }),
      }),
      service,
    );

    await handler.handle({ userId: USER_ID, username: "Steve" });

    expect(commands).toEqual([]);
  });
});
