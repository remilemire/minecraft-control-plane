// apps/backend/src/features/auth/clients/google-oauth.client.ts

import { AppError } from "@/errors/app-error.js";
import type { ExternalIdentity, OAuthApi } from "@/features/auth/auth.types.js";
import { OAuth2Client } from "google-auth-library";

export type GoogleOauthClientOptions = {
  readonly clientId: string;
};

export class GoogleOauthClient implements OAuthApi {
  private readonly oauthClient: OAuth2Client;
  private readonly clientId: string;

  public constructor({ clientId }: GoogleOauthClientOptions) {
    this.oauthClient = new OAuth2Client({ clientId });
    this.clientId = clientId;
  }

  public async verifyCredential(credential: string): Promise<ExternalIdentity> {
    const ticket = await this.verifyIdToken(credential);
    const payload = ticket.getPayload();

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
      ...(payload.name !== undefined ? { fullName: payload.name } : {}),
    };
  }

  private async verifyIdToken(credential: string) {
    try {
      return await this.oauthClient.verifyIdToken({
        idToken: credential,
        audience: this.clientId,
      });
    } catch (cause) {
      // The library throws on malformed, expired, or wrong-audience tokens;
      // surface that as an auth failure instead of an unhandled 500.
      throw new AppError("INVALID_GOOGLE_CREDENTIAL", { cause });
    }
  }
}
