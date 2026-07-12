// packages/shared/src/features/minecraft/players/minecraft-players.schemas.ts

import z from "zod";

// The `minecraft_profiles` table's internal surrogate primary key. Exposed as
// `id` on player responses for reference only — never accepted as a lookup
// key from a client; routes address a player by `userId` instead.
export const minecraftProfileIdSchema = z.uuid();

export const minecraftUsernameSchema = z
  .string()
  .min(3)
  .max(16)
  .regex(/^[A-Za-z0-9_]+$/);

export const setMinecraftPlayerSchema = z
  .object({
    username: minecraftUsernameSchema,
  })
  .strict();

export type SetMinecraftPlayerInput = z.infer<typeof setMinecraftPlayerSchema>;

export const minecraftPlayerResponseSchema = z.object({
  id: minecraftProfileIdSchema,
  username: minecraftUsernameSchema,
  uuid: z.uuid(),
  online: z.boolean(),
});

export type MinecraftPlayerResponse = z.infer<typeof minecraftPlayerResponseSchema>;
