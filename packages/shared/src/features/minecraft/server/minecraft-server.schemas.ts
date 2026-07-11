// packages/shared/src/features/minecraft/server/minecraft-server.schemas.ts

import z from "zod";

export const minecraftServerStatusSchema = z.enum(["RUNNING", "STOPPED"]);

export type MinecraftServerStatus = z.infer<typeof minecraftServerStatusSchema>;
