CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"accepted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "invitations_email_unique" UNIQUE("email"),
	CONSTRAINT "invitations_email_length_check" CHECK (char_length("invitations"."email") BETWEEN 1 AND 254)
);
--> statement-breakpoint
CREATE TABLE "minecraft_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"uuid" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "minecraft_profiles_username_unique" UNIQUE("username"),
	CONSTRAINT "minecraft_profiles_uuid_unique" UNIQUE("uuid"),
	CONSTRAINT "minecraft_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "username_length_check" CHECK (char_length("minecraft_profiles"."username") BETWEEN 3 AND 16)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_token_hash_length_check" CHECK (char_length("sessions"."token_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_id" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"minecraft_username" text,
	"minecraft_uuid" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_minecraft_username_length_check" CHECK (char_length("users"."minecraft_username") BETWEEN 3 AND 16),
	CONSTRAINT "users_email_length_check" CHECK (char_length("users"."email") BETWEEN 1 AND 254),
	CONSTRAINT "users_first_name_length_check" CHECK (char_length("users"."first_name") BETWEEN 1 AND 64),
	CONSTRAINT "users_last_name_length_check" CHECK (char_length("users"."last_name") BETWEEN 1 AND 64)
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minecraft_profiles" ADD CONSTRAINT "minecraft_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;