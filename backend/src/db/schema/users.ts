// backend/src/db/schema/users.ts

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),

    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),

    isAdmin: boolean("is_admin").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "users_email_length_check",
      sql`char_length(${table.email}) BETWEEN 1 AND 254`,
    ),
    check(
      "users_first_name_length_check",
      sql`char_length(${table.firstName}) BETWEEN 1 AND 64`,
    ),
    check(
      "users_last_name_length_check",
      sql`char_length(${table.lastName}) BETWEEN 1 AND 64`,
    ),

    unique("users_email_unique").on(table.email),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
