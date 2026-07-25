CREATE TYPE "public"."outbox_message_status" AS ENUM('pending', 'processing', 'completed', 'dead');--> statement-breakpoint
DROP INDEX "outbox_messages_pending_index";--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "status" "outbox_message_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
-- Backfill: existing rows carry the state that used to be derived, so a
-- completed row can't come back as claimable. `attempts >= 10` is the previous
-- dead-letter rule at the dispatcher's default maxAttempts.
UPDATE "outbox_messages" SET "status" = 'completed' WHERE "completed_at" IS NOT NULL;--> statement-breakpoint
UPDATE "outbox_messages" SET "status" = 'dead' WHERE "completed_at" IS NULL AND "attempts" >= 10;--> statement-breakpoint
CREATE INDEX "outbox_messages_claimable_index" ON "outbox_messages" USING btree ("next_attempt_at") WHERE "outbox_messages"."status" in ('pending', 'processing');
