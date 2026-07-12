// apps/backend/src/features/minecraft/players/minecraft-players.types.ts

export type MinecraftPlayer = {
  readonly id: string;
  readonly username: string;
  readonly uuid: string;
  readonly online: boolean;
};
