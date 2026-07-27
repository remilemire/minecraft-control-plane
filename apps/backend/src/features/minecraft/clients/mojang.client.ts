// apps/backend/src/features/minecraft/clients/mojang.client.ts

import { AppError } from "@/errors/app-error.js";
import type { MojangApi, MojangProfile } from "@/features/minecraft/minecraft.types.js";
import { minecraftUsernameSchema } from "@minecraft-control-plane/shared/minecraft";
import { z } from "zod";

const MOJANG_API_BASE = "https://api.mojang.com";

// Mojang returns the uuid undashed ("069a79f444e94726a5befca90e38aaf5"), while
// everything downstream — the shared schemas and the `uuid` columns — expects the
// canonical hyphenated form, so hyphenate it here at the boundary.
const mojangUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/i)
  .transform((id) => id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"));

const mojangAccountSchema = z.object({
  id: mojangUuidSchema,
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
