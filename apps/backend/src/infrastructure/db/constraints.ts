// apps/backend/src/infrastructure/db/constraints.ts

// Every unique/foreign key constraint name in the database, aggregated from the
// features that own them (`features/**/<feature>.constraints.ts`). A feature's
// schema module passes its own names into `.unique(...)` /
// `foreignKey({ name: ... })` so Drizzle never auto-generates one, and its
// repository keys the `withDbErrors` constraint map off the same constants, so
// a rename can't silently desync the two.
//
// Within a feature, import the constants from `./<feature>.constraints.js`;
// this barrel is for anything outside the owning feature (and for reading the
// whole set at once — constraint names share one namespace per database).

export * from "@/features/auth/oauth-identities/oauth-identities.constraints.js";
export * from "@/features/auth/sessions/sessions.constraints.js";
export * from "@/features/invitations/invitations.constraints.js";
export * from "@/features/minecraft/profiles/profiles.constraints.js";
export * from "@/features/users/users.constraints.js";
