// apps/backend/src/features/auth/oauth-identities/oauth-identities.service.ts

import type { NewOAuthIdentity, OAuthIdentity } from "@/db/schema/index.js";
import type { OAuthProvider } from "@/features/auth/auth.types.js";
import type { OAuthIdentityRepository } from "./oauth-identities.repository.js";
import type { OAuthIdentityWithUser } from "./oauth-identities.types.js";

// Owns the `oauth_identities` table (the link between a provider account and a
// user). There are no domain rules to enforce yet — the value is the boundary:
// AuthService goes through this service instead of the repository, so the
// linking rules have somewhere to live when they arrive.
export class OAuthIdentityService {
  public constructor(private readonly oauthIdentities: OAuthIdentityRepository) {}

  public async findBySubjectWithUser(
    provider: OAuthProvider,
    subject: string,
  ): Promise<OAuthIdentityWithUser | null> {
    return await this.oauthIdentities.findBySubjectWithUser(provider, subject);
  }

  public async create(input: NewOAuthIdentity): Promise<OAuthIdentity> {
    return await this.oauthIdentities.create(input);
  }
}
