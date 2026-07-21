// apps/backend/test/fakes/fake-google-oauth.client.ts

import { AppError } from "@/errors/app-error.js";
import type { ExternalIdentity, OAuthApi } from "@/features/auth/auth.types.js";
import { generateRandomSecret } from "@/lib/tokens.js";
import type { TokenPayload } from "google-auth-library";

let sequence = 0;

// The fields of google-auth-library's TokenPayload that GoogleOauthClient
// actually reads out of a verified credential.
type FakeTokenPayload = Pick<
  TokenPayload,
  "sub" | "email" | "email_verified" | "given_name" | "family_name"
>;

// In-memory stand-in for GoogleOauthClient. issueToken() registers a Google
// payload and returns the credential that resolves to it; verifyCredential()
// mirrors the real client's contract, rejecting unknown credentials and
// unverified identities with INVALID_GOOGLE_CREDENTIAL.
export class FakeGoogleOauthClient implements OAuthApi {
  private readonly payloads = new Map<string, FakeTokenPayload>();

  public issueToken(payload: { readonly email: string } & Partial<FakeTokenPayload>): string {
    const credential = generateRandomSecret();

    this.payloads.set(credential, {
      sub: `google-sub-${++sequence}`,
      email_verified: true,
      ...payload,
    });

    return credential;
  }

  public async verifyCredential(credential: string): Promise<ExternalIdentity> {
    const payload = this.payloads.get(credential);

    // Unknown credential, like the real library rejecting a bad token.
    if (payload === undefined) {
      throw new AppError("INVALID_GOOGLE_CREDENTIAL");
    }
    if (payload.email === undefined || !payload.email_verified) {
      throw new AppError("INVALID_GOOGLE_CREDENTIAL", {
        message: "Google did not provide a verified identity.",
      });
    }

    return {
      provider: "google",
      email: payload.email,
      providerSubject: payload.sub,
      ...(payload.given_name !== undefined ? { firstName: payload.given_name } : {}),
      ...(payload.family_name !== undefined ? { lastName: payload.family_name } : {}),
    };
  }
}
