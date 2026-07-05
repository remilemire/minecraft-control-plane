// apps/backend/src/db/with-db-errors.ts

import { DatabaseError } from "pg";
import { DbError, DbViolationError } from "./db-errors.js";
import type { ViolationCode } from "./db-violation.js";

const PG_TO_VIOLATION_CODE: Record<string, ViolationCode> = {
  "23502": "NOT_NULL",
  "23503": "FOREIGN_KEY",
  "23505": "UNIQUE",
  "23514": "CHECK",
  "23500": "INTEGRITY",
};

export async function withDbErrors<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (!(error instanceof DatabaseError)) {
      throw error;
    }

    if (error.constraint !== undefined) {
      throw new DbViolationError({
        constraint: error.constraint,
        message: error.message,
        code:
          error.code !== undefined
            ? (PG_TO_VIOLATION_CODE[error.code] ?? "INTEGRITY")
            : "INTEGRITY",
        ...(error.column !== undefined ? { columns: [error.column] } : {}),
        cause: error,
      });
    } else {
      throw new DbError(error.message, { cause: error });
    }
  }
}
