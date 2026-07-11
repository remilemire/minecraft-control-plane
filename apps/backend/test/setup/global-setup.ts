// apps/backend/test/setup/global-setup.ts

// Vitest globalSetup for the integration and api projects. Runs once in the
// main process before any test worker starts.
//
// It drops every per-worker test database left over from a previous run, so
// schema changes always land on a freshly migrated database (workers create
// and migrate their own database in setup-db.ts).
//
// This file must not import src modules: @/config/env.js validates the full
// environment at import time, and setup-env.ts only runs inside workers. The
// Postgres defaults below mirror setup-env.ts.

import pg from "pg";

function postgresAdminConfig() {
  return {
    user: process.env.POSTGRES_USER ?? "user",
    password: process.env.POSTGRES_PASSWORD ?? "password",
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database: "postgres",
  };
}

function baseDatabase(): string {
  return (process.env.POSTGRES_DATABASE ?? "minecraft_server").replace(/_test_w\d+$/, "");
}

export default async function globalSetup(): Promise<void> {
  const config = postgresAdminConfig();
  const client = new pg.Client(config);

  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Could not reach Postgres at ${config.host}:${config.port}. ` +
        "Integration and api tests need the compose db service running (make up).",
      { cause: error },
    );
  }

  try {
    const { rows } = await client.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE datname LIKE $1",
      [`${baseDatabase()}_test_w%`],
    );

    for (const { datname } of rows) {
      // Both the integration and api projects run this setup; a concurrent
      // drop of the same database is fine to ignore.
      await client.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`).catch(() => {});
    }
  } finally {
    await client.end();
  }
}
