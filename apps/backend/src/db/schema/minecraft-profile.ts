// apps/backend/src/db/schema/minecraft-profile.ts

import { sql } from "drizzle-orm";
import { check, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const minecraftProfiles = pgTable(
  "minecraft_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    username: text("username").notNull().unique(),
    uuid: uuid("uuid").notNull().unique(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
  },
  (table) => [check("username_length_check", sql`char_length(${table.username}) BETWEEN 3 AND 16`)],
);

export type MinecraftProfile = typeof minecraftProfiles.$inferSelect;
export type NewMinecraftProfile = typeof minecraftProfiles.$inferInsert;
