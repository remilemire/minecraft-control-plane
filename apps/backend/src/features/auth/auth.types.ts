// apps/backend/src/features/auth/auth.types.ts

import type { Session, User } from "@/db/schema/index.js";

export interface UserWithSessionToken {
  readonly user: User;
  readonly sessionToken: string;
}

export interface OAuthUrlWithState {
  readonly oauthUrl: string;
  readonly oauthState: string;
}

export interface AuthContext {
  readonly user: User;
  readonly session: Session;
}

export interface GoogleIdentity {
  readonly googleId: string;
  readonly email: string;
  readonly firstName?: string;
  readonly lastName?: string;
}
