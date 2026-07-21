INSERT INTO "oauth_identities" ("user_id", "provider", "subject") SELECT "id", 'google', "google_id" FROM "users";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_google_id_unique";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "google_id";