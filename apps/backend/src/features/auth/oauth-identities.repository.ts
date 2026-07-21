// apps/backend/src/features/auth/oauth-identities.repository.ts

import type { Db } from "@/db/client.js";
import { withDbErrors } from "@/db/errors.js";
import { oauthIdentities, users } from "@/db/schema/index.js";
import { and, eq } from "drizzle-orm";
import type { OAuthIdentityWithUser, OAuthProvider } from "./auth.types.js";

export class OAuthIdentityRepository {
  public constructor(private readonly db: Db) {}

  public async findBySubjectWithUser(
    provider: OAuthProvider,
    subject: string,
  ): Promise<OAuthIdentityWithUser | null> {
    const [row] = await withDbErrors(() =>
      this.db
        .select()
        .from(oauthIdentities)
        .innerJoin(users, eq(oauthIdentities.userId, users.id))
        .where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.subject, subject)))
        .limit(1),
    );
    return row !== undefined ? { identity: row.oauth_identities, user: row.users } : null;
  }
}
