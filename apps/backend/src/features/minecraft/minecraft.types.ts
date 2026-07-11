// apps/backend/src/features/minecraft/minecraft.types.ts

import type { MinecraftServerStatus } from "@minecraft-server/shared/minecraft";

export type MojangProfile = {
  readonly uuid: string;
  readonly username: string;
};

// Seam for tests: services depend on this interface so a fake can stand in
// for the real HTTP client.
export interface MojangApi {
  findByUsername(username: string): Promise<MojangProfile | null>;
}

// Seam for tests: services depend on this interface so a fake can stand in
// for the real docker compose process control.
export interface ProcessApi {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  getStatus(): Promise<MinecraftServerStatus>;
}

// Seam for tests: services depend on this interface so a fake can stand in
// for the real RCON connection.
export interface RconApi {
  execute(command: string): Promise<string>;
}
