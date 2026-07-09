// apps/backend/src/errors/translators/zod.translator.ts

import { ApiError } from "@/errors/api-error.js";
import { ZodError } from "zod";

export function translateZodError(error: unknown): ApiError | null {
  if (!(error instanceof ZodError)) {
    return null;
  }

  return new ApiError({
    status: 422,
    code: "VALIDATION",
    message: "There was a problem with the submission.",
    issues: error.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path.map((segment) => (typeof segment === "number" ? segment : String(segment))),
    })),
    cause: error,
  });
}
