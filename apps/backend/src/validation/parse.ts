// apps/backend/src/validation/parse.ts

import { ValidationError } from "@/errors/validation-error.js";
import type { z } from "zod";
import { toIssues } from "./to-issues.js";

export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  // `reportInput` makes zod keep each issue's raw input so we can tell a
  // missing field (input undefined) apart from a present-but-wrong-type one.
  const result = schema.safeParse(input, { reportInput: true });
  if (result.success) {
    return result.data;
  }
  throw new ValidationError(toIssues(result.error));
}
