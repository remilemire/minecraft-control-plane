// apps/backend/src/features/minecraft/profiles/minecraft-profiles.error-meta.ts

import type { ErrorMeta } from "@/errors/meta-types.js";
import type { MinecraftProfileErrorCode } from "@minecraft-server/shared/minecraft";

export const minecraftProfileErrorMeta = {
  MINECRAFT_PROFILE_NOT_FOUND: { message: "Minecraft profile not found." },
  MOJANG_PROFILE_NOT_FOUND: { message: "Mojang profile not found." },
} as const satisfies ErrorMeta<MinecraftProfileErrorCode>;
