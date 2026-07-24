// apps/backend/src/infrastructure/db/schemas.ts

// What the database *looks like*: every table, enum and row type, aggregated
// from the features that own them. Each feature declares its own table in
// `features/**/<feature>.schema.ts`; this file is the one place that sees all
// of them at once, which is what the drizzle client (`database.ts`) and
// `drizzle-kit` need. **A new feature table is invisible to migrations until
// it is re-exported here.**
//
// It is also the import surface for anything reaching for a table it doesn't
// own — a repository joining another feature's table, or a module wanting a
// row type. The exception is schema modules themselves: a table with a foreign
// key imports the owning feature's `*.schema.js` directly (see
// `invitations.schema.ts`), because going through this barrel would be a cycle.

export * from "@/features/auth/oauth-identities/oauth-identities.schema.js";
export * from "@/features/auth/sessions/sessions.schema.js";
export * from "@/features/invitations/invitations.schema.js";
export * from "@/features/minecraft/profiles/profiles.schema.js";
export * from "@/features/users/users.schema.js";
