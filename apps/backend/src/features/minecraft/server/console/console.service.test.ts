// apps/backend/src/features/minecraft/server/console/console.service.test.ts

import { FakeProcessClient } from "@test/fakes/fake-process.client.js";
import { FakeRconClient } from "@test/fakes/fake-rcon.client.js";
import type { MinecraftConsoleLogEvent } from "@minecraft-control-plane/shared/minecraft";
import { describe, expect, it } from "vitest";
import { MinecraftConsoleService } from "./console.service.js";

async function collectEvents(
  events: AsyncIterable<MinecraftConsoleLogEvent>,
): Promise<MinecraftConsoleLogEvent[]> {
  const collected = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

describe("MinecraftConsoleService", () => {
  it("filters per-command RCON connection noise without hiding other server logs", async () => {
    const processClient = new FakeProcessClient();
    processClient.logEvents = [
      {
        stream: "stdout",
        line: "[01:42:38] [RCON Listener #1/INFO] [minecraft/GenericThread]: Thread RCON Client /172.20.0.6 started",
      },
      {
        stream: "stdout",
        line: "[01:42:38] [Server thread/INFO] [minecraft/DedicatedServer]: [Rcon: Hello world]",
      },
      {
        stream: "stdout",
        line: "[01:42:38] [RCON Client /172.20.0.6 #2/INFO] [minecraft/RconClient]: Thread RCON Client /172.20.0.6 shutting down",
      },
      {
        stream: "stdout",
        line: "[01:42:07] [Server thread/INFO] [minecraft/RconThread]: RCON running on 0.0.0.0:25575",
      },
    ];
    const service = new MinecraftConsoleService(new FakeRconClient(), processClient);

    const events = await service.openLogStream(new AbortController().signal);

    await expect(collectEvents(events)).resolves.toEqual([
      {
        stream: "stdout",
        line: "[01:42:38] [Server thread/INFO] [minecraft/DedicatedServer]: [Rcon: Hello world]",
      },
      {
        stream: "stdout",
        line: "[01:42:07] [Server thread/INFO] [minecraft/RconThread]: RCON running on 0.0.0.0:25575",
      },
    ]);
  });
});
