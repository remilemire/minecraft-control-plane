// packages/shared/src/features/minecraft/profiles/profiles.schemas.ts

import { z } from "zod";

export const minecraftUsernameSchema = z
  .string()
  .min(3)
  .max(16)
  .regex(/^[A-Za-z0-9_]+$/);

export const minecraftProfileIdSchema = z.uuid();

// How far a profile got towards actually being whitelisted on the server: the
// whitelist command runs asynchronously (outbox), so a profile starts
// `pending`, becomes `whitelisted` once the server accepted the command, and
// only turns `failed` when the command was retried to exhaustion. Exported as
// a tuple as well so the backend's Drizzle `pgEnum` is built from the same
// values.
export const WHITELIST_STATUSES = ["pending", "whitelisted", "failed"] as const;

export const whitelistStatusSchema = z.enum(WHITELIST_STATUSES);

export type WhitelistStatus = z.infer<typeof whitelistStatusSchema>;

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
  whitelistStatus: whitelistStatusSchema,
});

export type MinecraftProfileResponse = z.infer<typeof minecraftProfileResponseSchema>;
