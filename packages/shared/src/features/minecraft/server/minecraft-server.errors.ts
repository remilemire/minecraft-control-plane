// packages/shared/src/features/minecraft/server/minecraft-server.errors.ts

import type { ErrorCatalog } from "../../../common/errors.js";

export const minecraftServerErrorCatalog = {} as const satisfies ErrorCatalog;

export type MinecraftServerErrorCode = keyof typeof minecraftServerErrorCatalog;
