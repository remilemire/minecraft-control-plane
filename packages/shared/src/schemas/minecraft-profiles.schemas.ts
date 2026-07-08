// packages/shared/src/schemas/minecraft-profiles.schemas.ts

import z from "zod";

export const minecraftUsernameSchema = z
  .string()
  .min(3, "Minecraft username must be at least 3 characters.")
  .max(16, "Minecraft username must be at most 16 characters.")
  .regex(
    /^[A-Za-z0-9_]+$/,
    "Minecraft username may only contain letters, numbers, and underscores.",
  );

export const createMinecraftProfileSchema = z.object({
  username: minecraftUsernameSchema,
});

export type CreateMinecraftProfileInput = z.infer<typeof createMinecraftProfileSchema>;

export const updateMinecraftProfileSchema = z.object({
  username: minecraftUsernameSchema,
});

export type UpdateMinecraftProfileInput = z.infer<typeof updateMinecraftProfileSchema>;

export const minecraftProfileResponseSchema = z.object({
  id: z.uuid(),
  username: minecraftUsernameSchema,
  uuid: z.uuid(),
});

export type MinecraftProfileResponse = z.infer<typeof minecraftProfileResponseSchema>;
