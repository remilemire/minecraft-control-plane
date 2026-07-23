// packages/shared/src/features/minecraft/players/players.schemas.ts

import { userIdSchema } from "@/features/users/index.js";
import z from "zod";

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
  userId: userIdSchema,
  username: minecraftUsernameSchema,
  uuid: z.uuid(),
  online: z.boolean(),
});

export type MinecraftPlayerResponse = z.infer<typeof minecraftPlayerResponseSchema>;
