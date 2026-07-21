ALTER TABLE "users" DROP CONSTRAINT "users_first_name_length_check";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_last_name_length_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "full_name" text;--> statement-breakpoint
UPDATE "users" SET "full_name" = NULLIF(CONCAT_WS(' ', "first_name", "last_name"), '');--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "first_name";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "last_name";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_full_name_length_check" CHECK (char_length("users"."full_name") BETWEEN 1 AND 129);
