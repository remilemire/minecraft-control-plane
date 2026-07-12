// apps/backend/drizzle.config.ts

import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";
import { buildPostgresUrl, postgresEnvSchema } from "./src/config/postgres.js";

dotenv.config({ path: "../../.env" });

const postgres = postgresEnvSchema.parse(process.env);
const postgresUrl = buildPostgresUrl({ ...postgres });

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: postgresUrl,
  },
});
