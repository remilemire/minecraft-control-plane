// apps/backend/src/db/schema/sessions.ts

import { SESSIONS_CONSTRAINTS } from "@/db/constraints.js";
import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    tokenHash: text("token_hash").notNull().unique(SESSIONS_CONSTRAINTS.TOKEN_HASH_UNIQUE),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    userId: uuid("user_id").notNull(),
  },
  (table) => [
    check("sessions_token_hash_length_check", sql`char_length(${table.tokenHash}) = 64`),
    foreignKey({
      name: SESSIONS_CONSTRAINTS.USER_ID_FK,
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
