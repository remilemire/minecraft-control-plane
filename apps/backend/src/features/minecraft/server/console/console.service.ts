// apps/backend/src/features/minecraft/server/console/console.service.ts

import type { ProcessApi, RconApi } from "@/features/minecraft/minecraft.types.js";
import type { MinecraftConsoleLogEvent } from "@minecraft-control-plane/shared/minecraft";

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
    return await this.processClient.openLogStream(signal);
  }
}
