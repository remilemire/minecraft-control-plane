// apps/backend/src/features/users/users.schema.ts

import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { USERS_CONSTRAINTS } from "./users.constraints.js";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    email: text("email").notNull().unique(USERS_CONSTRAINTS.EMAIL_UNIQUE),

    fullName: text("full_name"),

    isAdmin: boolean("is_admin").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("users_email_length_check", sql`char_length(${table.email}) BETWEEN 1 AND 254`),
    // 129 = the two former 64-char name columns joined with a space.
    check("users_full_name_length_check", sql`char_length(${table.fullName}) BETWEEN 1 AND 129`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
