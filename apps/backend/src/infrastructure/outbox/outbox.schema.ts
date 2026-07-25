// apps/backend/src/infrastructure/outbox/outbox.schema.ts

// Messages awaiting side-effect execution, written in the same transaction as
// the state change they belong to and executed by the OutboxDispatcher after
// commit. There is no status column — state is derived:
//
//   completed        completed_at IS NOT NULL (rows are kept as an audit trail)
//   actively claimed claim_expires_at > now()
//   due              completed_at IS NULL AND next_attempt_at <= now()
//                    AND (claim_expires_at IS NULL OR claim_expires_at <= now())
//   dead-lettered    completed_at IS NULL AND attempts >= the dispatcher's max
//
// `claim_id` is a fencing token regenerated on every claim; markCompleted /
// markFailed only apply while it still matches, so a worker whose claim
// expired can't stomp a newer claim's outcome.
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { OUTBOX_MESSAGES_CONSTRAINTS } from "./outbox.constraints.js";

export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    type: text("type").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),

    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    claimId: uuid("claim_id"),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    lastError: text("last_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index(OUTBOX_MESSAGES_CONSTRAINTS.PENDING_INDEX)
      .on(table.nextAttemptAt)
      .where(sql`${table.completedAt} IS NULL`),
  ],
);

export type OutboxMessage = typeof outboxMessages.$inferSelect;
export type NewOutboxMessage = typeof outboxMessages.$inferInsert;
