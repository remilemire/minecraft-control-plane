// backend/src/db/errors.ts
import pg from "pg";
export function isUniqueViolation(error, constraint) {
    return (error instanceof pg.DatabaseError &&
        error.code === "23505" &&
        (constraint === undefined || error.constraint === constraint));
}
export function isNotNullViolation(error, column) {
    return (error instanceof pg.DatabaseError &&
        error.code === "23502" &&
        (column === undefined || error.column === column));
}
export function isForeignKeyViolation(error, constraint) {
    return (error instanceof pg.DatabaseError &&
        error.code === "23503" &&
        (constraint === undefined || error.constraint === constraint));
}
export function isCheckViolation(error, constraint) {
    return (error instanceof pg.DatabaseError &&
        error.code === "23514" &&
        (constraint === undefined || error.constraint === constraint));
}
export function isIntegrityViolation(error) {
    return (error instanceof pg.DatabaseError &&
        error.code !== undefined &&
        error.code in ["23500, 23502, 23503, 23505, 23514"]);
}
//# sourceMappingURL=errors.js.map