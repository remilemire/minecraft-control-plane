// apps/backend/src/db/db-errors.ts

import { type DbViolation, type ViolationCode } from "./db-violation.js";

export class DbError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

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
