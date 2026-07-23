// apps/backend/src/infrastructure/db/schema/invitations.ts

import { INVITATIONS_CONSTRAINTS } from "@/infrastructure/db/constraints.js";
import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    email: text("email").notNull().unique(INVITATIONS_CONSTRAINTS.EMAIL_UNIQUE),

    invitedByUserId: uuid("created_by_user_id").notNull(),
    acceptedByUserId: uuid("accepted_by_user_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (table) => [
    check("invitations_email_length_check", sql`char_length(${table.email}) BETWEEN 1 AND 254`),
    foreignKey({
      name: INVITATIONS_CONSTRAINTS.INVITED_BY_USER_ID_FK,
      columns: [table.invitedByUserId],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    foreignKey({
      name: INVITATIONS_CONSTRAINTS.ACCEPTED_BY_USER_ID_FK,
      columns: [table.acceptedByUserId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
  ],
);

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
