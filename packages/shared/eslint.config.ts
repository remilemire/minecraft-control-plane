// packages/shared/eslint.config.ts

import { defineConfig } from "eslint/config";
import globals from "globals";
import baseConfig from "../../eslint.config.base.js";

export default defineConfig([
  ...baseConfig,
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
