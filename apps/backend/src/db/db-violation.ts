// apps/backend/src/db/db-violation.ts

export type ViolationCode = "INTEGRITY" | "NOT_NULL" | "FOREIGN_KEY" | "UNIQUE" | "CHECK";

export interface DbViolation {
  readonly message: string;
  readonly code: ViolationCode;
  readonly constraint: string;
  readonly table?: string;
  readonly columns?: readonly string[];
}
