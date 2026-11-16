// apps/minecraft-controller/eslint.config.ts

import { defineConfig } from "eslint/config";
import globals from "globals";
import baseConfig from "../../eslint.config.base.js";

export default defineConfig([
  ...baseConfig,
  {
    files: ["src/server/routes.ts", "src/backups/routes.ts", "src/maintenance/routes.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/runtime/*",
                "@/state/*",
                "@/tasks/*",
                "@/server/*",
                "@/backups/*",
                "@/maintenance/*",
              ],
              message:
                "Feature routes depend on their own services; cross-feature coordination belongs in services.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/runtime/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/backups/*", "@/maintenance/*", "@/tasks/*", "@/state/*"],
              message:
                "Runtime adapters must not depend on controller workflows or backup/state features.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/maintenance/coordinator.ts", "src/maintenance/journal.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/backups/*", "@/tasks/*", "@/state/*"],
              message:
                "The maintenance engine receives task definitions and persistence through its ports.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
