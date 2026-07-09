// apps/backend/src/db/errors.ts

import { InfrastructureError } from "@/errors/base-errors.js";
import { DatabaseError } from "pg";

export type ViolationCode = "INTEGRITY" | "NOT_NULL" | "FOREIGN_KEY" | "UNIQUE" | "CHECK";

export interface DbViolation {
  readonly message: string;
  readonly code: ViolationCode;
  readonly constraint: string;
  readonly table?: string;
  readonly columns?: readonly string[];
}

export class DbError extends InfrastructureError {}

export type DbViolationErrorOptions = DbViolation & ErrorOptions;

export class DbViolationError extends DbError {
  public readonly code: ViolationCode;
  public readonly constraint: string;
  public readonly table?: string;
  public readonly columns?: readonly string[];

  public constructor({
    message,
    constraint,
    code,
    columns,
    table,
    cause,
  }: DbViolationErrorOptions) {
    super(message, { cause });
    this.code = code;
    this.constraint = constraint;

    if (table !== undefined) {
      this.table = table;
    }
    if (columns !== undefined) {
      this.columns = [...columns];
    }
  }
}

export async function withDbErrors<T>(transaction: () => Promise<T>): Promise<T> {
  try {
    return await transaction();
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

const PG_TO_VIOLATION_CODE: Record<string, ViolationCode> = {
  "23502": "NOT_NULL",
  "23503": "FOREIGN_KEY",
  "23505": "UNIQUE",
  "23514": "CHECK",
  "23500": "INTEGRITY",
};
