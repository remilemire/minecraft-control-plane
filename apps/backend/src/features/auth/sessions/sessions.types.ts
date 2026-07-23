// apps/backend/src/features/auth/sessions/sessions.types.ts

import type { Session, User } from "@/db/schema/index.js";

export interface CreateSessionData {
  readonly userId: string;
}

export interface SessionWithUser {
  readonly session: Session;
  readonly user: User;
}

export interface SessionWithToken {
  readonly session: Session;
  readonly sessionToken: string;
}
