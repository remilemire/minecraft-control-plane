// apps/backend/src/features/minecraft/server/console/console.service.ts

import type { ProcessApi, RconApi } from "@/features/minecraft/minecraft.types.js";
import type { MinecraftConsoleLogEvent } from "@minecraft-control-plane/shared/minecraft";

const RCON_CLIENT_LIFECYCLE_LINES = [
  /\[minecraft\/GenericThread\]: Thread RCON Client \/\S+ started/,
  /\[minecraft\/RconClient\]: Thread RCON Client \/\S+ shutting down/,
];

export class MinecraftConsoleService {
  public constructor(
    private readonly rconClient: RconApi,
    private readonly processClient: ProcessApi,
  ) {}

  public async execute(command: string): Promise<void> {
    await this.rconClient.execute(command);
  }

  public async openLogStream(
    signal: AbortSignal,
  ): Promise<AsyncIterable<MinecraftConsoleLogEvent>> {
    const events = await this.processClient.openLogStream(signal);
    return filterRconClientLifecycleEvents(events);
  }
}

async function* filterRconClientLifecycleEvents(
  events: AsyncIterable<MinecraftConsoleLogEvent>,
): AsyncIterable<MinecraftConsoleLogEvent> {
  for await (const event of events) {
    if (!RCON_CLIENT_LIFECYCLE_LINES.some((pattern) => pattern.test(event.line))) {
      yield event;
    }
  }
}
