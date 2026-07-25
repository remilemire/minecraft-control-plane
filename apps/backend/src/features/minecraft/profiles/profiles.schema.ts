// apps/backend/src/features/minecraft/profiles/profiles.schema.ts

// A standalone whitelist entry: a Mojang account (username + uuid) allowed on
// the server. Profiles are not tied to users — any authenticated user can add
// or remove them.
import { sql } from "drizzle-orm";
import { check, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { MINECRAFT_PROFILES_CONSTRAINTS } from "./profiles.constraints.js";

export const minecraftProfiles = pgTable(
  "minecraft_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    username: text("username").notNull().unique(MINECRAFT_PROFILES_CONSTRAINTS.USERNAME_UNIQUE),
    uuid: uuid("uuid").notNull().unique(MINECRAFT_PROFILES_CONSTRAINTS.UUID_UNIQUE),
  },
  (table) => [check("username_length_check", sql`char_length(${table.username}) BETWEEN 3 AND 16`)],
);

export type MinecraftProfile = typeof minecraftProfiles.$inferSelect;
export type NewMinecraftProfile = typeof minecraftProfiles.$inferInsert;
