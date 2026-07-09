// apps/backend/src/features/minecraft/clients/mojang.client.ts

import { MojangClientError } from "@/features/minecraft/minecraft.errors.js";
import { minecraftUsernameSchema } from "@minecraft-server/shared/schemas";
import z from "zod";

const MOJANG_API_BASE = "https://api.mojang.com";

const mojangAccountSchema = z.object({
  id: z.uuid(),
  name: minecraftUsernameSchema,
});

export type MojangProfile = {
  readonly uuid: string;
  readonly username: string;
};

export class MojangClient {
  public constructor() {}

  public async findByUsername(username: string): Promise<MojangProfile | null> {
    const response = await fetch(
      `${MOJANG_API_BASE}/users/profiles/minecraft/${encodeURIComponent(username)}`,
    );

    if (response.status === 404 || response.status === 202) {
      return null;
    }
    if (!response.ok) {
      throw new MojangClientError(`Mojang returned status ${response.status}.`);
    }

    const data = await response.json();
    const result = mojangAccountSchema.safeParse(data);

    if (!result.success) {
      throw new MojangClientError("Mojang returned an unexpected response.", {
        cause: result.error,
      });
    }

    const { id, name } = result.data;
    return { uuid: id, username: name };
  }
}
