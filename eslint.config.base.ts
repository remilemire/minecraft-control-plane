// packages/shared/eslint.config.base.ts

import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "node_modules"]),

  js.configs.recommended,
  ...tseslint.configs.recommended,

  eslintConfigPrettier,
]);
