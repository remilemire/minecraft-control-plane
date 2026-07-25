// packages/shared/src/features/minecraft/profiles/profiles.schemas.ts

import z from "zod";

export const minecraftUsernameSchema = z
  .string()
  .min(3)
  .max(16)
  .regex(/^[A-Za-z0-9_]+$/);

export const minecraftProfileIdSchema = z.uuid();

export const createMinecraftProfileSchema = z
  .object({
    username: minecraftUsernameSchema,
  })
  .strict();

export type CreateMinecraftProfileInput = z.infer<typeof createMinecraftProfileSchema>;

export const minecraftProfileResponseSchema = z.object({
  id: minecraftProfileIdSchema,
  username: minecraftUsernameSchema,
  uuid: z.uuid(),
  online: z.boolean(),
});

export type MinecraftProfileResponse = z.infer<typeof minecraftProfileResponseSchema>;
