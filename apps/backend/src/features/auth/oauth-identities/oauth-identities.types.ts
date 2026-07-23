// apps/backend/src/features/auth/oauth-identities/oauth-identities.types.ts

import type { OAuthIdentity, User } from "@/infrastructure/db/schema/index.js";

// The identity row joined to the user it belongs to — what a subject lookup
// resolves to. Only this sub-feature produces it; auth consumes the `user`.
export interface OAuthIdentityWithUser {
  readonly identity: OAuthIdentity;
  readonly user: User;
}
