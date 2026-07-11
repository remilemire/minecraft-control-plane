// packages/shared/src/features/minecraft/profiles/minecraft-profiles.schemas.ts

import z from "zod";

export const minecraftProfileIdSchema = z.uuid();

export const minecraftUsernameSchema = z.string().regex(/^[A-Za-z0-9_]+$/);

export const createMinecraftProfileSchema = z.object({
  username: minecraftUsernameSchema,
});

export type CreateMinecraftProfileInput = z.infer<typeof createMinecraftProfileSchema>;

export const updateMinecraftProfileSchema = z.object({
  username: minecraftUsernameSchema,
});

export type UpdateMinecraftProfileInput = z.infer<typeof updateMinecraftProfileSchema>;

export const minecraftProfileResponseSchema = z.object({
  id: minecraftProfileIdSchema,
  username: minecraftUsernameSchema,
  uuid: z.uuid(),
});

export type MinecraftProfileResponse = z.infer<typeof minecraftProfileResponseSchema>;
