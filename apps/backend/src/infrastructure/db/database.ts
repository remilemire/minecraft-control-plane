// apps/backend/src/infrastructure/db/database.ts

import { env } from "@/config/env.js";
import * as schema from "@/infrastructure/db/schemas.js";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
