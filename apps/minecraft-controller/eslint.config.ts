import { defineConfig } from "eslint/config";
import globals from "globals";
import baseConfig from "../../eslint.config.base.js";
import { boundaryRule } from "./boundaries.config.js";

export default defineConfig([
  ...baseConfig,
  {
    files: ["src/**/*.ts"],
    plugins: { controller: { rules: { boundaries: boundaryRule } } },
    rules: {
      "controller/boundaries": "error",
      "no-restricted-imports": ["error", { patterns: ["../*"] }],
    },
  },
  {
    files: [
      "src/runtime/**/*.ts",
      "src/maintenance/coordinator.ts",
      "src/maintenance/task.ts",
      "src/maintenance/contracts.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["../*"] },
            {
              group: [
                "@/backups/*",
                "@/server/*",
                "@/server-data/*",
                "@/installation/*",
                "@/state/*",
              ],
              message:
                "Runtime and generic maintenance cannot depend on feature implementations or aggregate state.",
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
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
]);
