// apps/backend/test/setup/setup-db.ts

// Second setup file for the integration and api projects (after setup-env).
// Creates and migrates this worker's test database once per test file, wipes
// all tables between tests, and closes the pool when the file is done.

import { afterAll, beforeEach } from "vitest";
import { closeTestDb, ensureTestDatabase, truncateAllTables } from "../helpers/test-db.js";

await ensureTestDatabase();

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await closeTestDb();
});
