// apps/backend/src/features/minecraft/profiles/profiles.constraints.ts

export const MINECRAFT_PROFILES_CONSTRAINTS = {
  USERNAME_UNIQUE: "minecraft_profiles_username_unique",
  UUID_UNIQUE: "minecraft_profiles_uuid_unique",
  USER_ID_UNIQUE: "minecraft_profiles_user_id_unique",
  USER_ID_FK: "minecraft_profiles_user_id_users_id_fk",
} as const;
