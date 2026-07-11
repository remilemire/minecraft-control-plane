// packages/shared/vitest.config.ts

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Colocated unit tests next to the source they cover.
    include: ["src/**/*.test.ts"],
  },
});
