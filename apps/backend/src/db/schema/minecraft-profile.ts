// apps/backend/src/db/schema/minecraft-profile.ts

import { MINECRAFT_PROFILES_CONSTRAINTS } from "@/db/constraints.js";
import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const minecraftProfiles = pgTable(
  "minecraft_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    username: text("username").notNull().unique(MINECRAFT_PROFILES_CONSTRAINTS.USERNAME_UNIQUE),
    uuid: uuid("uuid").notNull().unique(MINECRAFT_PROFILES_CONSTRAINTS.UUID_UNIQUE),

    userId: uuid("user_id").notNull(),
  },
  (table) => [
    check("username_length_check", sql`char_length(${table.username}) BETWEEN 3 AND 16`),
    unique(MINECRAFT_PROFILES_CONSTRAINTS.USER_ID_UNIQUE).on(table.userId),
    foreignKey({
      name: MINECRAFT_PROFILES_CONSTRAINTS.USER_ID_FK,
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
  ],
);

export type MinecraftProfile = typeof minecraftProfiles.$inferSelect;
export type NewMinecraftProfile = typeof minecraftProfiles.$inferInsert;
