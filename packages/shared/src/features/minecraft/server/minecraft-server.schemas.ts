// packages/shared/src/features/minecraft/server/minecraft-server.schemas.ts

import z from "zod";

export const minecraftServerStatusSchema = z.enum(["RUNNING", "STOPPED"]);

export type MinecraftServerStatus = z.infer<typeof minecraftServerStatusSchema>;

export const minecraftServerStatusResponseSchema = z.object({
  status: minecraftServerStatusSchema,
});

export type MinecraftServerStatusResponse = z.infer<typeof minecraftServerStatusResponseSchema>;

export const minecraftServerPlayersResponseSchema = z.object({
  online: z.number().int().nonnegative(),
  maximum: z.number().int().nonnegative(),
  players: z.array(z.string()),
});

export type MinecraftServerPlayersResponse = z.infer<typeof minecraftServerPlayersResponseSchema>;
