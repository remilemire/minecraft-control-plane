// apps/backend/src/errors/translators/minecraft.translator.ts

import { ApiError } from "@/errors/api-error.js";
import {
  MinecraftProfileNotFoundError,
  MojangClientError,
  MojangProfileNotFoundError,
  RconClientError,
} from "@/features/minecraft/minecraft.errors.js";

export function translateMinecraftError(error: unknown): ApiError | null {
  if (error instanceof MinecraftProfileNotFoundError) {
    return new ApiError({
      status: 404,
      code: "MINECRAFT_PROFILE_NOT_FOUND",
      message: error.message,
      cause: error,
    });
  }
  if (error instanceof MojangProfileNotFoundError) {
    return new ApiError({
      status: 404,
      code: "MOJANG_PROFILE_NOT_FOUND",
      message: error.message,
      cause: error,
    });
  }
  if (error instanceof MojangClientError) {
    return new ApiError({
      status: 502,
      code: "MOJANG_UNAVAILABLE",
      message: "Could not reach Mojang.",
      cause: error,
    });
  }
  if (error instanceof RconClientError) {
    return new ApiError({
      status: 502,
      code: "MINECRAFT_SERVER_UNAVAILABLE",
      message: "Could not reach the Minecraft server.",
      cause: error,
    });
  }

  return null;
}
