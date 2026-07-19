// apps/backend/src/features/minecraft/profiles/minecraft-profiles.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { MinecraftProfileErrorCode } from "@minecraft-server/shared/minecraft";

export const minecraftProfileErrorCatalog = {
  MINECRAFT_PROFILE_NOT_FOUND: { message: "Minecraft profile not found." },
  MOJANG_PROFILE_NOT_FOUND: { message: "Mojang profile not found." },
  MINECRAFT_USERNAME_TAKEN: { message: "This Minecraft username is already linked to a user." },
  MINECRAFT_ACCOUNT_TAKEN: { message: "This Minecraft account is already linked to a user." },
} as const satisfies ErrorCatalog<MinecraftProfileErrorCode>;
