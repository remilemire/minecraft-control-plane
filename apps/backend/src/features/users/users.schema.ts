// apps/backend/src/features/users/users.schema.ts

import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { USERS_CONSTRAINTS } from "./users.constraints.js";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    email: text("email").notNull().unique(USERS_CONSTRAINTS.EMAIL_UNIQUE),

    fullName: text("full_name"),

    isOwner: boolean("is_owner").notNull().default(false),

    // Null = has never signed in. The first sign-in stamps it and adopts the
    // provider's display name (owner-provisioned rows carry no name until then).
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("users_email_length_check", sql`char_length(${table.email}) BETWEEN 1 AND 254`),
    // 129 = the two former 64-char name columns joined with a space.
    check("users_full_name_length_check", sql`char_length(${table.fullName}) BETWEEN 1 AND 129`),
    // At most one owner, enforced by the database — READ COMMITTED makes
    // check-then-write racy, so this index is the invariant.
    uniqueIndex(USERS_CONSTRAINTS.SINGLE_OWNER_UNIQUE)
      .on(table.isOwner)
      .where(sql`${table.isOwner}`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
