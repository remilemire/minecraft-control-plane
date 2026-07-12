// apps/backend/src/features/minecraft/minecraft.types.ts

import type { MinecraftServerStatus } from "@minecraft-server/shared/minecraft";

export type MojangProfile = {
  readonly uuid: string;
  readonly username: string;
};

export interface MojangApi {
  findByUsername(username: string): Promise<MojangProfile | null>;
}

export interface ProcessApi {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  getStatus(): Promise<MinecraftServerStatus>;
}

export interface RconApi {
  execute(command: string): Promise<string>;
}
