// apps/minecraft-controller/vitest.config.ts

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@test": fileURLToPath(new URL("./test", import.meta.url)),
    },
  },
  test: {
    // Colocated unit tests next to the source they cover.
    include: ["src/**/*.test.ts"],
  },
});
