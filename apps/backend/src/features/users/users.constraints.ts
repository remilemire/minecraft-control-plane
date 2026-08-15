// apps/backend/src/features/users/users.constraints.ts

export const USERS_CONSTRAINTS = {
  EMAIL_UNIQUE: "users_email_unique",
  SINGLE_OWNER_UNIQUE: "users_single_owner_unique",
} as const;
