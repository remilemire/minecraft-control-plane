// apps/backend/src/db/errors.ts

export { DbError, DbViolationError } from "./db-errors.js";
export type { DbViolation, ViolationCode } from "./db-violation.js";
export { withDbErrors } from "./with-db-errors.js";
