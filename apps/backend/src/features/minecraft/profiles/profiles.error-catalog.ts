// apps/backend/src/features/minecraft/profiles/profiles.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { MinecraftProfileErrorCode } from "@minecraft-control-plane/shared/minecraft";

export const minecraftProfileErrorCatalog = {
  MINECRAFT_PROFILE_NOT_FOUND: { message: "Minecraft profile not found." },
  MOJANG_PROFILE_NOT_FOUND: { message: "Mojang profile not found." },
  MINECRAFT_USERNAME_TAKEN: { message: "This Minecraft username is already whitelisted." },
  MINECRAFT_ACCOUNT_TAKEN: { message: "This Minecraft account is already whitelisted." },
} as const satisfies ErrorCatalog<MinecraftProfileErrorCode>;
