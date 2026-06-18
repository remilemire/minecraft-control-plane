// backend/src/features/users/user.types.ts

import type { CreateUserProfileInput } from "./user.schemas.js";

export type CreateUserData = CreateUserProfileInput & { passwordHash: string };
