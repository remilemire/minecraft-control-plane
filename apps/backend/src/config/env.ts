// apps/backend/src/config/env.ts

import { emailSchema } from "@minecraft-control-plane/shared/common";
import { z } from "zod";
import { buildPostgresUrl, postgresEnvSchema } from "./postgres.js";

// This module only *parses* process.env — nothing here reads a .env file. The
// environment is already filled by the time it loads: host dev passes
// --env-file-if-exists for the root and backend files (the `dev` script),
// Compose injects the same values via env_file, and tests set their own in
// test/setup/setup-env.ts.
const envSchema = z.object({
  APP_ENV: z.enum(["prod", "dev"]).default("prod"),
  BACKEND_PORT: z.coerce.number().int().positive(),

  // Path of the built SPA to serve same-origin (set by the prod image);
  // unset → no static serving (dev uses the Vite dev server).
  SPA_DIR: z.string().exactOptional(),

  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  CSRF_TTL_DAYS: z.coerce.number().int().positive().default(7),

  GOOGLE_CLIENT_ID: z.string().min(1),

  MINECRAFT_CONTROLLER_URL: z.url(),
  MINECRAFT_CONTROLLER_TOKEN: z.string().min(1),

  SESSION_SECRET: z.string().min(1),
  // May create the very first account — as the owner — while no owner exists
  // yet. Parsed with the shared emailSchema (trim + lowercase) so it compares
  // cleanly against normalized user emails.
  BOOTSTRAP_OWNER_EMAIL: emailSchema,
});

const parsedEnv = envSchema.parse(process.env);
const postgres = postgresEnvSchema.parse(process.env);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const env = {
  ...parsedEnv,
  ...postgres,

  DEBUG: parsedEnv.APP_ENV === "dev",

  SESSION_TTL_MS: parsedEnv.SESSION_TTL_DAYS * MS_PER_DAY,
  CSRF_TTL_MS: parsedEnv.CSRF_TTL_DAYS * MS_PER_DAY,

  DATABASE_URL: buildPostgresUrl(postgres),
};

export type Env = typeof env;
