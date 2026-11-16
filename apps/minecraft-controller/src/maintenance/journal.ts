import { maintenanceOperationSchema } from "@minecraft-control-plane/shared/minecraft";
import { z } from "zod";
export const maintenanceJournalSchema = maintenanceOperationSchema.extend({
  taskVersion: z.number().int().nonnegative().default(0),
  checkpoint: z.string().nullable().default(null),
  recoverOnReconnect: z.boolean().default(false),
  cleanupComplete: z.boolean().default(false),
});
