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

// Structural subset of google-auth-library's token payload — the fields this
// app reads out of a verified Google credential.
export interface GoogleTokenPayload {
  readonly sub: string;
  readonly email?: string;
  readonly email_verified?: boolean;
  readonly given_name?: string;
  readonly family_name?: string;
}

// The verified identity the rest of the app consumes; Google's wire fields are
// never seen outside the google-oauth client.
export interface GoogleIdentity {
  readonly googleId: string;
  readonly email: string;
  readonly firstName?: string;
  readonly lastName?: string;
}

// Seam for tests: the auth service depends on this interface so a fake can
// stand in for the real Google client (see FakeGoogleOauthClient).
export interface GoogleOauthApi {
  verifyCredential(credential: string): Promise<GoogleIdentity>;
}
