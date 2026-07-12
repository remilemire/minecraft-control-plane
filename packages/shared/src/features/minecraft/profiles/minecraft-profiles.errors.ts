// packages/shared/src/features/minecraft/profiles/minecraft-profiles.errors.ts

import type { ErrorCatalog } from "../../../common/errors.js";

export const minecraftProfileErrorCatalog = {
  MINECRAFT_PROFILE_NOT_FOUND: { kind: "NOT_FOUND" },
  MOJANG_PROFILE_NOT_FOUND: { kind: "NOT_FOUND" },
  MINECRAFT_USERNAME_TAKEN: { kind: "CONFLICT" },
  MINECRAFT_ACCOUNT_TAKEN: { kind: "CONFLICT" },
} as const satisfies ErrorCatalog;

export type MinecraftProfileErrorCode = keyof typeof minecraftProfileErrorCatalog;
