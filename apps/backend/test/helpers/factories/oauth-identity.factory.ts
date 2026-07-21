// apps/backend/test/helpers/factories/oauth-identity.factory.ts

import { db } from "@/db/client.js";
import { oauthIdentities, type NewOAuthIdentity, type OAuthIdentity } from "@/db/schema/index.js";
import { createUser } from "./user.factory.js";

let sequence = 0;

export async function createOAuthIdentity(
  overrides: Partial<NewOAuthIdentity> = {},
): Promise<OAuthIdentity> {
  const n = ++sequence;
  const userId = overrides.userId ?? (await createUser()).id;

  const [oauthIdentity] = await db
    .insert(oauthIdentities)
    .values({
      provider: "google",
      subject: `google-subject-${n}`,
      ...overrides,
      userId,
    })
    .returning();

  if (oauthIdentity === undefined) {
    throw new Error("createOAuthIdentity: insert returned no row.");
  }

  return oauthIdentity;
}
