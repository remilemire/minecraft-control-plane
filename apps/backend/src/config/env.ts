// apps/backend/src/config/env.ts

import dotenv from "dotenv";
import { z } from "zod";
import { buildPostgresUrl, postgresEnvSchema } from "./postgres.js";

dotenv.config({ path: "../.env" });
dotenv.config({ path: ".env", override: true });

const envSchema = z.object({
  APP_ENV: z.enum(["prod", "dev"]).default("prod"),
  BACKEND_PORT: z.coerce.number().int().positive(),

  CORS_ALLOWED_ORIGINS: z.string().default(""),
  COOKIE_DOMAIN: z.string().optional(),

  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  CSRF_TTL_DAYS: z.coerce.number().int().positive().default(7),
  INVITATION_TTL_DAYS: z.coerce.number().int().positive().default(7),

  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REDIRECT_URL: z.string(),

  SESSION_SECRET: z.string().min(1),
  ADMIN_EMAIL: z.string().min(1),
});

const parsedEnv = envSchema.parse(process.env);
const postgres = postgresEnvSchema.parse(process.env);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const env = {
  ...parsedEnv,
  ...postgres,

  DEBUG: parsedEnv.APP_ENV === "dev",

  ALLOWED_ORIGINS: parsedEnv.CORS_ALLOWED_ORIGINS.split(",")
    .map((origin: string) => origin.trim())
    .filter(Boolean),

  SESSION_TTL_MS: parsedEnv.SESSION_TTL_DAYS * MS_PER_DAY,
  CSRF_TTL_MS: parsedEnv.CSRF_TTL_DAYS * MS_PER_DAY,
  INVITATION_TTL_MS: parsedEnv.INVITATION_TTL_DAYS * MS_PER_DAY,

  DATABASE_URL: buildPostgresUrl(postgres),
};

export type Env = typeof env;
