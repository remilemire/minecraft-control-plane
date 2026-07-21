// apps/backend/src/features/auth/auth.types.ts

import type { OAuthIdentity, oauthProviderEnum, Session, User } from "@/db/schema/index.js";

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

// The OAuth providers we support. The set is defined by the DB enum
// (`oauth_identities.provider`); the identity and client seams below are
// provider-agnostic so more can be added there without touching the auth
// service.
export type OAuthProvider = (typeof oauthProviderEnum.enumValues)[number];

// The verified identity the rest of the app consumes; a provider's wire fields
// are never seen outside its OAuth client. `providerSubject` is the provider's
// stable subject id for the account (Google's `sub`).
export interface ExternalIdentity {
  readonly provider: OAuthProvider;
  readonly providerSubject: string;
  readonly email: string;
  readonly fullName?: string;
}

// Seam for tests: the auth service depends on this interface so a fake can
// stand in for the real OAuth client (see FakeGoogleOauthClient).
export interface OAuthApi {
  verifyCredential(credential: string): Promise<ExternalIdentity>;
}

// A credential to verify together with the provider that issued it. The auth
// service uses `provider` to pick the matching client from its registry.
export interface OAuthData {
  readonly credential: string;
  readonly provider: OAuthProvider;
}

// The OAuth clients the auth service dispatches to, one per provider. Wiring
// (routes/index.ts) assembles the registry from the injected boundary clients.
export type OAuthClients = Record<OAuthProvider, OAuthApi>;

export interface OAuthIdentityWithUser {
  readonly identity: OAuthIdentity;
  readonly user: User;
}
