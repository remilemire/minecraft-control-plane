// apps/backend/src/db/constraints.ts

// Single source of truth for every unique/foreign key constraint name.
// Schema modules pass these into `.unique(...)` / `foreignKey({ name: ... })`
// so Drizzle never auto-generates a name; repositories key their
// `withDbErrors` constraint maps off the same constants so a rename can't
// silently desync the two.

export const USERS_CONSTRAINTS = {
  GOOGLE_ID_UNIQUE: "users_google_id_unique",
  EMAIL_UNIQUE: "users_email_unique",
} as const;

export const INVITATIONS_CONSTRAINTS = {
  EMAIL_UNIQUE: "invitations_email_unique",
  INVITED_BY_USER_ID_FK: "invitations_created_by_user_id_users_id_fk",
  ACCEPTED_BY_USER_ID_FK: "invitations_accepted_by_user_id_users_id_fk",
} as const;

export const MINECRAFT_PROFILES_CONSTRAINTS = {
  USERNAME_UNIQUE: "minecraft_profiles_username_unique",
  UUID_UNIQUE: "minecraft_profiles_uuid_unique",
  USER_ID_UNIQUE: "minecraft_profiles_user_id_unique",
  USER_ID_FK: "minecraft_profiles_user_id_users_id_fk",
} as const;

export const SESSIONS_CONSTRAINTS = {
  TOKEN_HASH_UNIQUE: "sessions_token_hash_unique",
  USER_ID_FK: "sessions_user_id_users_id_fk",
} as const;

export const OAUTH_IDENTITIES_CONSTRAINTS = {
  PROVIDER_SUBJECT_UNIQUE: "oauth_identities_provider_subject_unique",
  USER_ID_FK: "oauth_identities_user_id_users_id_fk",
} as const;
