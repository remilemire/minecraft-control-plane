// apps/backend/src/db/client.ts
import { env } from "../config/env.js";
import * as schema from "../db/schema/index.js";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
export const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
});
export const db = drizzle(pool, { schema });
//# sourceMappingURL=client.js.map