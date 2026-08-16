// apps/backend/test/fakes/fake-process.client.ts

import type { ProcessApi } from "@/features/minecraft/minecraft.types.js";
import type {
  MinecraftConsoleLogEvent,
  MinecraftServerStatus,
} from "@minecraft-control-plane/shared/minecraft";

// In-memory stand-in for docker compose process control. Tracks the calls
// made and mutates status the way the real container lifecycle would.
export class FakeProcessClient implements ProcessApi {
  public status: MinecraftServerStatus = "RUNNING";
  public logEvents: MinecraftConsoleLogEvent[] = [];

  public readonly calls: ("start" | "stop" | "restart")[] = [];

  public async start(): Promise<void> {
    this.calls.push("start");
    this.status = "RUNNING";
  }

  public async stop(): Promise<void> {
    this.calls.push("stop");
    this.status = "STOPPED";
  }

  public async restart(): Promise<void> {
    this.calls.push("restart");
    this.status = "RUNNING";
  }

  public async getStatus(): Promise<MinecraftServerStatus> {
    return this.status;
  }

  public async openLogStream(
    signal: AbortSignal,
  ): Promise<AsyncIterable<MinecraftConsoleLogEvent>> {
    const events = [...this.logEvents];

    return (async function* () {
      for (const event of events) {
        if (signal.aborted) {
          return;
        }
        yield event;
      }
    })();
  }
}
