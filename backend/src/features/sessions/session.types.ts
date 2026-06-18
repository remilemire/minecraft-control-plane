// backend/src/features/sessions/session.types.ts

import type { Session, User } from "@/db/schema/index.js";
import type { RandomSecret, SecretHash } from "@/lib/crypto.js";
import type { Brand } from "@/lib/types.js";

export type SessionToken = Brand<RandomSecret, "SessionToken">;
export type SessionTokenHash = Brand<SecretHash, "SessionTokenHash">;

export interface SessionWithUser {
  readonly session: Session;
  readonly user: User;
}

export interface SessionWithToken {
  readonly session: Session;
  readonly sessionToken: SessionToken;
}
