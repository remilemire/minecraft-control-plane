// packages/shared/src/features/minecraft/server/server.errors.ts

import type { ErrorMeta } from "@/common/index.js";

export const minecraftServerErrorMeta = {} as const satisfies ErrorMeta;

export type MinecraftServerErrorCode = keyof typeof minecraftServerErrorMeta;
