// backend/src/features/auth/auth.types.ts

import type { Session, User } from "@/db/schema/index.js";
import type { SessionToken } from "@/features/sessions/session.types.js";

export interface UserWithSessionToken {
  readonly user: User;
  readonly sessionToken: SessionToken;
}

export interface AuthContext {
  readonly user: User;
  readonly session: Session;
}
