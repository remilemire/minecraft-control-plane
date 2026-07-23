// apps/backend/src/features/minecraft/players/players.types.ts

export type MinecraftPlayer = {
  readonly userId: string;
  readonly username: string;
  readonly uuid: string;
  readonly online: boolean;
};
