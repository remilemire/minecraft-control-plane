// packages/shared/src/features/minecraft/server/console/console.schemas.ts

import { z } from "zod";

export const minecraftConsoleCommandSchema = z
  .object({
    command: z.string().trim().min(1),
  })
  .strict();

export type MinecraftConsoleCommand = z.infer<typeof minecraftConsoleCommandSchema>;

export const minecraftConsoleLogEventSchema = z.object({
  stream: z.enum(["stdout", "stderr"]),
  line: z.string(),
});

export type MinecraftConsoleLogEvent = z.infer<typeof minecraftConsoleLogEventSchema>;
