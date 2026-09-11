// apps/minecraft-controller/src/config.ts

import { z } from "zod";
import { fileURLToPath } from "node:url";

// This module only *parses* process.env — nothing here reads a .env file. The
// environment is already filled by the time it loads: host dev passes
// --env-file-if-exists for the root file (the `dev` script) and Compose injects
// its values via `environment:`. Only the composition root (server.ts) imports
// this module, so tests never trigger the import-time parse.
const envSchema = z.object({
  // In-container the default applies (compose publishes 8001 → 8000); host dev
  // picks up MINECRAFT_CONTROLLER_PORT=8001 from the root .env, matching the
  // backend's http://localhost:8001 default and avoiding the backend's 8000.
  MINECRAFT_CONTROLLER_PORT: z.coerce.number().int().positive().default(8000),

  MINECRAFT_COMPOSE_PROJECT: z.string().min(1),
  // Must equal the minecraft service key in compose.yaml (which stamps the
  // com.docker.compose.service label). Compose passes it explicitly; the
  // default covers host-run dev.
  MINECRAFT_COMPOSE_SERVICE: z.string().min(1).default("minecraft"),
  MINECRAFT_CONTROLLER_TOKEN: z.string().min(1),

  DOCKER_SOCKET: z.string().min(1).default("/var/run/docker.sock"),
  MINECRAFT_DATA_ROOT: z
    .string()
    .min(1)
    .default(fileURLToPath(new URL("../../../data", import.meta.url))),
  MINECRAFT_BACKUP_TIMEZONE: z
    .string()
    .default("America/Edmonton")
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, "Use an IANA timezone name."),
  MINECRAFT_BACKUP_KEEP_HOURLY: z.coerce.number().int().positive().default(6),
  MINECRAFT_BACKUP_KEEP_DAILY: z.coerce.number().int().positive().default(5),
  MINECRAFT_BACKUP_KEEP_WEEKLY: z.coerce.number().int().positive().default(3),
  MINECRAFT_BACKUP_KEEP_MONTHLY: z.coerce.number().int().positive().default(2),
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;
