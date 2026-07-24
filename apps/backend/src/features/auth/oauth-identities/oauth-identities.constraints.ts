// apps/backend/src/features/auth/oauth-identities/oauth-identities.constraints.ts

export const OAUTH_IDENTITIES_CONSTRAINTS = {
  PROVIDER_SUBJECT_UNIQUE: "oauth_identities_provider_subject_unique",
  USER_ID_FK: "oauth_identities_user_id_users_id_fk",
} as const;
