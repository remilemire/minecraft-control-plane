// apps/backend/src/infrastructure/db/migrate.ts

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "./types.js";

// migrations/ sits at the package root, a sibling of src/ — and of dist/ in
// the deployed image, so the same relative hop works in both layouts.
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../../migrations", import.meta.url));

// Applies pending .sql migrations (drizzle-kit's output) at boot. Prod runs
// this before listening — the image has no drizzle-kit; dev applies
// migrations explicitly via `make migrate` instead.
export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
