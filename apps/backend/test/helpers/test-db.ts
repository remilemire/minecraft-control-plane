// apps/backend/test/helpers/test-db.ts

// Database plumbing for integration and api tests. The exported db/pool are
// the real src singletons — setup-env.ts pointed them at this worker's test
// database before anything imported @/config/env.js.

import { env } from "@/config/env.js";
import { db, pool } from "@/infrastructure/db/index.js";
import * as schema from "@/infrastructure/db/schema/index.js";
import { getTableName, is, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { PgTable } from "drizzle-orm/pg-core";
import { fileURLToPath } from "node:url";
import pg from "pg";

export { db, pool };

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../migrations", import.meta.url));

const tableNames = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => `"${getTableName(table)}"`);

function assertTestDatabase(): void {
  if (!/_test_w\d+$/.test(env.database)) {
    throw new Error(`Refusing to touch non-test database "${env.database}".`);
  }
}

// Creates this worker's test database if a previous test file in the same
// worker hasn't already, then brings it to the latest migration.
export async function ensureTestDatabase(): Promise<void> {
  assertTestDatabase();

  const admin = new pg.Client({
    user: env.user,
    password: env.password,
    host: env.host,
    port: env.port,
    database: "postgres",
  });

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${env.database}"`);
  } catch (error) {
    // 42P04 duplicate_database — already created by an earlier test file.
    if (!(error instanceof pg.DatabaseError && error.code === "42P04")) {
      throw error;
    }
  } finally {
    await admin.end();
  }

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

export async function truncateAllTables(): Promise<void> {
  assertTestDatabase();
  await db.execute(sql.raw(`TRUNCATE TABLE ${tableNames.join(", ")} RESTART IDENTITY CASCADE`));
}

export async function closeTestDb(): Promise<void> {
  await pool.end();
}
