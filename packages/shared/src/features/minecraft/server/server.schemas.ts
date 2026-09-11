// packages/shared/src/features/minecraft/server/server.schemas.ts

export * from "./console/console.schemas.js";

import { z } from "zod";
import { maintenanceOperationSchema } from "@/features/minecraft/backups/backups.schemas.js";

export const minecraftServerStatusSchema = z.enum(["RUNNING", "STOPPED"]);

export type MinecraftServerStatus = z.infer<typeof minecraftServerStatusSchema>;

export const minecraftServerStatusResponseSchema = z.object({
  status: minecraftServerStatusSchema,
  maintenance: maintenanceOperationSchema.nullable().default(null),
});

export type MinecraftServerStatusResponse = z.infer<typeof minecraftServerStatusResponseSchema>;
