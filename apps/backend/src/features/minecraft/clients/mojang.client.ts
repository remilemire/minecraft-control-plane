// apps/backend/src/features/minecraft/clients/mojang.client.ts

import { AppError } from "@/errors/app-error.js";
import type { MojangApi, MojangProfile } from "@/features/minecraft/minecraft.types.js";
import { minecraftUsernameSchema } from "@minecraft-server/shared/minecraft";
import z from "zod";

const MOJANG_API_BASE = "https://api.mojang.com";

const mojangAccountSchema = z.object({
  id: z.uuid(),
  name: minecraftUsernameSchema,
});

export class MojangClient implements MojangApi {
  public constructor() {}

  public async findByUsername(username: string): Promise<MojangProfile | null> {
    const response = await fetch(
      `${MOJANG_API_BASE}/users/profiles/minecraft/${encodeURIComponent(username)}`,
    );

    if (response.status === 404 || response.status === 202) {
      return null;
    }
    if (!response.ok) {
      throw new AppError("MOJANG_CLIENT_ERROR", {
        message: `Mojang returned status ${response.status}.`,
      });
    }

    const data = await response.json();
    const result = mojangAccountSchema.safeParse(data);

    if (!result.success) {
      throw new AppError("MOJANG_CLIENT_ERROR", {
        message: "Mojang returned an unexpected response.",
        cause: result.error,
      });
    }

    const { id, name } = result.data;
    return { uuid: id, username: name };
  }
}
