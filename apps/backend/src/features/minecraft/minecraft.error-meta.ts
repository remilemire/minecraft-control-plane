// apps/backend/src/features/minecraft/minecraft.error-meta.ts

import type { ErrorMeta } from "@/errors/meta-types.js";
import { minecraftClientErrorMeta } from "./clients/minecraft-client.error-meta.js";
import { minecraftProfileErrorMeta } from "./profiles/minecraft-profiles.error-meta.js";
import { minecraftServerErrorMeta } from "./server/minecraft-server.error-meta.js";
import type {
  MinecraftClientErrorCode,
  MinecraftProfileErrorCode,
  MinecraftServerErrorCode,
} from "@minecraft-server/shared/minecraft";

export const minecraftErrorMeta = {
  ...minecraftClientErrorMeta,
  ...minecraftProfileErrorMeta,
  ...minecraftServerErrorMeta,
} as const satisfies ErrorMeta<
  MinecraftClientErrorCode | MinecraftProfileErrorCode | MinecraftServerErrorCode
>;
