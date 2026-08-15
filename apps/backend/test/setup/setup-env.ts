// apps/backend/test/setup/setup-env.ts

// Patch zod before any test file can create schemas — zod v4 copies base
// methods onto schemas at construction, so .openapi() must exist first
// regardless of the test file's import order.
import "@/openapi/zod-extend.js";

// First setup file for every project. Runs in each worker before any test
// file (and therefore before @/config/env.js parses process.env), so the
// environment is final by the time src code loads.
//
// Values set with ??= are defaults that CI or a container can override. The
// database name is always forced to a per-worker `_test_w<id>` database so a
// test run can never touch a real database, and so parallel workers never
// share state. Keep the Postgres defaults in sync with global-setup.ts.

const poolId = process.env.VITEST_POOL_ID ?? "1";

process.env.APP_ENV = "dev";
process.env.BACKEND_PORT ??= "8000";

process.env.POSTGRES_USER ??= "user";
process.env.POSTGRES_PASSWORD ??= "password";
process.env.POSTGRES_HOST ??= "localhost";
process.env.POSTGRES_PORT ??= "5432";

const baseDatabase = (process.env.POSTGRES_DATABASE ?? "minecraft_server").replace(
  /_test_w\d+$/,
  "",
);
process.env.POSTGRES_DATABASE = `${baseDatabase}_test_w${poolId}`;

process.env.SESSION_SECRET ??= "test-session-secret";
process.env.GOOGLE_CLIENT_ID ??= "test-client-id.apps.googleusercontent.com";
process.env.BOOTSTRAP_OWNER_EMAIL ??= "bootstrap@example.com";

process.env.MINECRAFT_RCON_HOST ??= "localhost";
process.env.MINECRAFT_RCON_PORT ??= "25575";
process.env.MINECRAFT_RCON_PASSWORD ??= "test-rcon-password";
process.env.MINECRAFT_CONTROLLER_URL ??= "http://minecraft-controller:8000";
process.env.MINECRAFT_CONTROLLER_TOKEN ??= "test-controller-token";
