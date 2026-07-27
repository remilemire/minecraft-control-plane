// apps/backend/src/infrastructure/db/index.ts

// The database module's public surface: how the rest of the app *talks to*
// the database. What the database *looks like* is owned by the features and
// keeps its own entry points — `@/infrastructure/db/schemas.js` for tables and
// row types, `@/infrastructure/db/constraints.js` for constraint names — since
// those aggregate the features' own modules and are shared with drizzle-kit.
//
// Importing this barrel constructs the connection pool, but `pg.Pool` opens
// no sockets until the first query, so pulling in `withDbErrors` or a type
// costs nothing at import time.
//
// Modules *inside* this directory must not import the barrel (it would be a
// cycle); they reach each other by relative path, or through
// `@/infrastructure/db/*.js` from a subdirectory.

export * from "./database.js";
export * from "./errors.js";
export * from "./migrate.js";
export * from "./provider.js";
export * from "./transaction/index.js";
export * from "./types.js";
