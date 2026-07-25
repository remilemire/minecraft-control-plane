// apps/backend/src/features/minecraft/profiles/profiles.types.ts

export type MinecraftProfileWithStatus = {
  readonly id: string;
  readonly username: string;
  readonly uuid: string;
  readonly online: boolean;
};
