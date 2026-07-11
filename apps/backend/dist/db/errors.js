// apps/backend/src/db/errors.ts
import { AppError } from "@/errors/app-error.js";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { DatabaseError } from "pg";
// Postgres SQLSTATE codes for class 23 (integrity constraint violation).
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_ERROR_CODE = {
    NOT_NULL_VIOLATION: "23502",
    FOREIGN_KEY_VIOLATION: "23503",
    UNIQUE_VIOLATION: "23505",
    CHECK_VIOLATION: "23514",
};
export async function withDbErrors(operation) {
    try {
        return await operation();
    }
    catch (rawError) {
        // Drizzle wraps driver failures in DrizzleQueryError; the pg error with
        // the SQLSTATE code is its cause.
        const error = rawError instanceof DrizzleQueryError ? rawError.cause : rawError;
        if (!(error instanceof DatabaseError)) {
            throw new AppError("SERVICE_UNAVAILABLE", { cause: rawError });
        }
        switch (error.code) {
            case PG_ERROR_CODE.NOT_NULL_VIOLATION:
                throw new AppError("NOT_NULL_VIOLATION", { cause: error });
            case PG_ERROR_CODE.FOREIGN_KEY_VIOLATION:
                throw new AppError("FOREIGN_KEY_VIOLATION", { cause: error });
            case PG_ERROR_CODE.UNIQUE_VIOLATION:
                throw new AppError("UNIQUE_VIOLATION", { cause: error });
            case PG_ERROR_CODE.CHECK_VIOLATION:
                throw new AppError("CHECK_VIOLATION", { cause: error });
        }
        // Any other class-23 (integrity constraint violation) code without a
        // dedicated case above, e.g. exclusion_violation (23P01).
        if (error.code?.startsWith("23")) {
            throw new AppError("INTEGRITY_VIOLATION", { cause: error });
        }
        throw new AppError("INTERNAL", { cause: error });
    }
}
//# sourceMappingURL=errors.js.map