// apps/backend/src/features/auth/oauth-identities/oauth-identities.repository.ts

import { withDbErrors, type DatabaseProvider } from "@/infrastructure/db/index.js";
import {
  oauthIdentities,
  users,
  type NewOAuthIdentity,
  type OAuthIdentity,
} from "@/infrastructure/db/schema/index.js";
import { AppError } from "@/errors/app-error.js";
import { and, eq } from "drizzle-orm";
import type { OAuthProvider } from "@/features/auth/auth.types.js";
import type { OAuthIdentityWithUser } from "./oauth-identities.types.js";

export class OAuthIdentityRepository {
  public constructor(private readonly databaseProvider: DatabaseProvider) {}

  public async findBySubjectWithUser(
    provider: OAuthProvider,
    subject: string,
  ): Promise<OAuthIdentityWithUser | null> {
    const [row] = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .select()
        .from(oauthIdentities)
        .innerJoin(users, eq(oauthIdentities.userId, users.id))
        .where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.subject, subject)))
        .limit(1),
    );
    return row !== undefined ? { identity: row.oauth_identities, user: row.users } : null;
  }

  // No constraint-error map: a (provider, subject) unique violation here would
  // mean the same external identity got linked twice inside the registration
  // transaction (a race, not a user-facing input error), so it's left to fall
  // through `withDbErrors` to `INTERNAL` rather than a dedicated error code.
  public async create(input: NewOAuthIdentity): Promise<OAuthIdentity> {
    const [identity] = await withDbErrors(() =>
      this.databaseProvider.get().insert(oauthIdentities).values(input).returning(),
    );

    if (identity === undefined) {
      throw new AppError("SERVICE_UNAVAILABLE", { message: "Failed to create OAuth identity." });
    }

    return identity;
  }
}
