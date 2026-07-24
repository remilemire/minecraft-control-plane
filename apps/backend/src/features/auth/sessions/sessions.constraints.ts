// apps/backend/src/features/auth/sessions/sessions.constraints.ts

export const SESSIONS_CONSTRAINTS = {
  TOKEN_HASH_UNIQUE: "sessions_token_hash_unique",
  USER_ID_FK: "sessions_user_id_users_id_fk",
} as const;
