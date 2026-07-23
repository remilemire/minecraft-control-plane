// packages/shared/src/features/minecraft/profiles/profiles.errors.ts

import type { ErrorMeta } from "@/common/index.js";

export const minecraftProfileErrorMeta = {
  MINECRAFT_PROFILE_NOT_FOUND: { kind: "NOT_FOUND" },
  MOJANG_PROFILE_NOT_FOUND: { kind: "NOT_FOUND" },
  MINECRAFT_USERNAME_TAKEN: { kind: "CONFLICT" },
  MINECRAFT_ACCOUNT_TAKEN: { kind: "CONFLICT" },
} as const satisfies ErrorMeta;

export type MinecraftProfileErrorCode = keyof typeof minecraftProfileErrorMeta;
