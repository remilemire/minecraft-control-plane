ALTER TABLE "invitations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "invitations" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_single_owner_unique" ON "users" USING btree ("is_owner") WHERE "users"."is_owner";--> statement-breakpoint
UPDATE "users" SET "email" = lower(trim("email"));