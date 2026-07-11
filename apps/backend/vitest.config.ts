// apps/backend/vitest.config.ts

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Three test layers:
//   unit         — colocated *.test.ts; no database, external clients faked.
//   integration  — colocated *.integration.test.ts; repositories against a
//                  real per-worker Postgres test database.
//   api          — test/api/*.api.test.ts; black-box supertest against the
//                  full express app with fakes at the external boundaries.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@test": fileURLToPath(new URL("./test", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
          setupFiles: ["./test/setup/setup-env.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          setupFiles: ["./test/setup/setup-env.ts", "./test/setup/setup-db.ts"],
          globalSetup: ["./test/setup/global-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "api",
          include: ["test/api/**/*.api.test.ts"],
          setupFiles: ["./test/setup/setup-env.ts", "./test/setup/setup-db.ts"],
          globalSetup: ["./test/setup/global-setup.ts"],
        },
      },
    ],
  },
});
