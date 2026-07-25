// apps/backend/src/infrastructure/outbox/outbox.schema.ts

// Messages awaiting side-effect execution, written in the same transaction as
// the state change they belong to and executed by the OutboxDispatcher after
// commit. `status` is the lifecycle state, and the dispatcher is the only
// writer of it:
//
//   pending    enqueued or released after a failed attempt; due once
//              next_attempt_at has passed
//   processing claimed by a worker until claim_expires_at (a claim that
//              expires without an outcome is re-claimable, and stays
//              `processing` while it is retried)
//   completed  the handler ran to completion (rows are kept as an audit trail)
//   dead       gave up after the dispatcher's max attempts; last_error is kept
//
// `claim_id` is a fencing token regenerated on every claim; markCompleted /
// markFailed only apply while it still matches, so a worker whose claim
// expired can't stomp a newer claim's outcome.
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { OUTBOX_MESSAGES_CONSTRAINTS } from "./outbox.constraints.js";

const OUTBOX_MESSAGE_STATUSES = ["pending", "processing", "completed", "dead"] as const;

export const outboxMessageStatusEnum = pgEnum("outbox_message_status", OUTBOX_MESSAGE_STATUSES);

export type OutboxMessageStatus = (typeof OUTBOX_MESSAGE_STATUSES)[number];

// The two states a message can be claimed from: never-attempted rows and rows
// whose claim expired mid-flight.
export const OUTBOX_CLAIMABLE_STATUSES = [
  "pending",
  "processing",
] as const satisfies readonly OutboxMessageStatus[];

export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    type: text("type").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),

    status: outboxMessageStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    claimId: uuid("claim_id"),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    lastError: text("last_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    // Covers the claim query: the terminal states (completed/dead) are the ones
    // that accumulate, and none of them are ever scanned again.
    index(OUTBOX_MESSAGES_CONSTRAINTS.CLAIMABLE_INDEX)
      .on(table.nextAttemptAt)
      .where(sql`${table.status} in ('pending', 'processing')`),
  ],
);

export type OutboxMessage = typeof outboxMessages.$inferSelect;
export type NewOutboxMessage = typeof outboxMessages.$inferInsert;
