// apps/backend/src/features/minecraft/server/minecraft-server.error-meta.ts

import type { ErrorMeta } from "@/errors/meta-types.js";
import type { MinecraftServerErrorCode } from "@minecraft-server/shared/minecraft";

export const minecraftServerErrorMeta = {} as const satisfies ErrorMeta<MinecraftServerErrorCode>;
