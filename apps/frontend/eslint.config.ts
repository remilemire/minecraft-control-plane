// apps/frontend/eslint.config.ts

import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig } from "eslint/config";
import globals from "globals";
import { dirname } from "path";
import { fileURLToPath } from "url";
import baseConfig from "../../eslint.config.base.js";

export default defineConfig([
  ...baseConfig,

  reactHooks.configs.flat.recommended,
  reactRefresh.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
      },
    },
  },
]);
