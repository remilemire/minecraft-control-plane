// apps/backend/src/features/minecraft/server/server.service.test.ts

import { FakeProcessClient } from "@test/fakes/fake-process.client.js";
import { FakeRconClient } from "@test/fakes/fake-rcon.client.js";
import { describe, expect, it } from "vitest";
import { MinecraftServerService } from "./server.service.js";

describe("MinecraftServerService", () => {
  it("whitelists the given username", async () => {
    const rcon = new FakeRconClient();
    const service = new MinecraftServerService(rcon, new FakeProcessClient());

    await service.addToWhitelist("Notch");

    expect(rcon.executed).toEqual(["whitelist add Notch"]);
  });

  it("removes the given username from the whitelist", async () => {
    const rcon = new FakeRconClient();
    const service = new MinecraftServerService(rcon, new FakeProcessClient());

    await service.removeFromWhitelist("Notch");

    expect(rcon.executed).toEqual(["whitelist remove Notch"]);
  });

  it("delegates start/stop/restart/status to the process client", async () => {
    const process = new FakeProcessClient();
    const service = new MinecraftServerService(new FakeRconClient(), process);

    await service.start();
    await service.stop();
    await service.restart();

    expect(process.calls).toEqual(["start", "stop", "restart"]);
    // restart leaves the fake RUNNING.
    expect(await service.getStatus()).toBe("RUNNING");
  });

  it("lists online usernames via the rcon list command", async () => {
    const rcon = new FakeRconClient();
    rcon.respondTo("list", "There are 0 of a max of 20 players online:");
    const service = new MinecraftServerService(rcon, new FakeProcessClient());

    expect(await service.listOnlineUsernames()).toEqual([]);
    expect(rcon.executed).toEqual(["list"]);
  });

  it("parses the player names from a non-empty rcon list response", async () => {
    const rcon = new FakeRconClient();
    rcon.respondTo("list", "There are 2 of a max of 20 players online: Steve, Alex");
    const service = new MinecraftServerService(rcon, new FakeProcessClient());

    expect(await service.listOnlineUsernames()).toEqual(["Steve", "Alex"]);
  });

  it.each(["\n", "\r\n"])(
    "parses player names when the rcon list response ends with %j",
    async (lineEnding) => {
      const rcon = new FakeRconClient();
      rcon.respondTo("list", `There are 2 of a max of 20 players online: Steve, Alex${lineEnding}`);
      const service = new MinecraftServerService(rcon, new FakeProcessClient());

      expect(await service.listOnlineUsernames()).toEqual(["Steve", "Alex"]);
    },
  );
});
