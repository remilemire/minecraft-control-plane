// apps/backend/src/features/invitations/invitations.constraints.ts

export const INVITATIONS_CONSTRAINTS = {
  EMAIL_UNIQUE: "invitations_email_unique",
  INVITED_BY_USER_ID_FK: "invitations_created_by_user_id_users_id_fk",
  ACCEPTED_BY_USER_ID_FK: "invitations_accepted_by_user_id_users_id_fk",
} as const;
