// apps/backend/src/features/minecraft/profiles/minecraft-profiles.types.ts

import type { CreateMinecraftProfileInput } from "@minecraft-server/shared/minecraft";

export type CreateMinecraftProfileData = CreateMinecraftProfileInput & { readonly userId: string };
