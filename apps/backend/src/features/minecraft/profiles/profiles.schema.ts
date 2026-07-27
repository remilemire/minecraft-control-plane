// apps/backend/src/features/minecraft/profiles/profiles.schema.ts

// A standalone whitelist entry: a Mojang account (username + uuid) allowed on
// the server. Profiles are not tied to users — any authenticated user can add
// or remove them.
import type { WhitelistStatus } from "@minecraft-control-plane/shared/minecraft";
import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { MINECRAFT_PROFILES_CONSTRAINTS } from "./profiles.constraints.js";

// The wire format's statuses, repeated as a tuple `pgEnum` accepts. Importing
// the shared `WHITELIST_STATUSES` value instead would break `db:generate`:
// drizzle-kit loads schema modules through Node's CommonJS resolver, which
// asks the shared package's ESM-only `exports` map for a `require` condition
// it doesn't have. Only the erased `import type` above survives that, so
// `satisfies` is what keeps the two lists in sync.
const WHITELIST_STATUSES = [
  "pending",
  "whitelisted",
  "failed",
] as const satisfies readonly WhitelistStatus[];

export const whitelistStatusEnum = pgEnum("whitelist_status", WHITELIST_STATUSES);

export const minecraftProfiles = pgTable(
  "minecraft_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    username: text("username").notNull().unique(MINECRAFT_PROFILES_CONSTRAINTS.USERNAME_UNIQUE),
    uuid: uuid("uuid").notNull().unique(MINECRAFT_PROFILES_CONSTRAINTS.UUID_UNIQUE),

    // Whether the whitelist command reached the server yet; the row is
    // inserted before the outbox dispatcher runs it, hence the default.
    whitelistStatus: whitelistStatusEnum("whitelist_status").notNull().default("pending"),
  },
  (table) => [check("username_length_check", sql`char_length(${table.username}) BETWEEN 3 AND 16`)],
);

export type MinecraftProfile = typeof minecraftProfiles.$inferSelect;
export type NewMinecraftProfile = typeof minecraftProfiles.$inferInsert;
