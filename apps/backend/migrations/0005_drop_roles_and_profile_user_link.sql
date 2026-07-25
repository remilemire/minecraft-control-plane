ALTER TABLE "minecraft_profiles" DROP CONSTRAINT "minecraft_profiles_user_id_unique";--> statement-breakpoint
ALTER TABLE "minecraft_profiles" DROP CONSTRAINT "minecraft_profiles_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "minecraft_profiles" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "is_admin";