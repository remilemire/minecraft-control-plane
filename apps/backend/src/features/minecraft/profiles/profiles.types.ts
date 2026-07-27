// apps/backend/src/features/minecraft/profiles/profiles.types.ts

import type { WhitelistStatus } from "@minecraft-control-plane/shared/minecraft";

export type MinecraftProfileWithStatus = {
  readonly id: string;
  readonly username: string;
  readonly uuid: string;
  readonly online: boolean;
  readonly whitelistStatus: WhitelistStatus;
};
