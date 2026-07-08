// apps/backend/src/db/errors.ts
import { DatabaseError } from "pg";
export class DbError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = new.target.name;
    }
}
export class DbViolationError extends DbError {
    code;
    constraint;
    table;
    columns;
    constructor({ message, constraint, code, columns, table, cause, }) {
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
export async function withDbErrors(transaction) {
    try {
        return await transaction();
    }
    catch (error) {
        if (!(error instanceof DatabaseError)) {
            throw error;
        }
        if (error.constraint !== undefined) {
            throw new DbViolationError({
                constraint: error.constraint,
                message: error.message,
                code: error.code !== undefined
                    ? (PG_TO_VIOLATION_CODE[error.code] ?? "INTEGRITY")
                    : "INTEGRITY",
                ...(error.column !== undefined ? { columns: [error.column] } : {}),
                cause: error,
            });
        }
        else {
            throw new DbError(error.message, { cause: error });
        }
    }
}
const PG_TO_VIOLATION_CODE = {
    "23502": "NOT_NULL",
    "23503": "FOREIGN_KEY",
    "23505": "UNIQUE",
    "23514": "CHECK",
    "23500": "INTEGRITY",
};
//# sourceMappingURL=errors.js.map