// apps/backend/src/features/auth/clients/google-oauth.client.ts

import { AppError } from "@/errors/app-error.js";
import type {
  GoogleIdentity,
  GoogleOauthApi,
  GoogleTokenPayload,
} from "@/features/auth/auth.types.js";
import { OAuth2Client } from "google-auth-library";

export type GoogleOauthClientOptions = {
  readonly clientId: string;
};

export class GoogleOauthClient implements GoogleOauthApi {
  private readonly oauthClient: OAuth2Client;
  private readonly clientId: string;

  public constructor({ clientId }: GoogleOauthClientOptions) {
    this.oauthClient = new OAuth2Client({ clientId });
    this.clientId = clientId;
  }

  public async verifyCredential(credential: string): Promise<GoogleIdentity> {
    const ticket = await this.verifyIdToken(credential);
    const payload: GoogleTokenPayload | undefined = ticket.getPayload();

    if (payload === undefined) {
      throw new AppError("INVALID_GOOGLE_CREDENTIAL");
    }
    if (payload.email === undefined || !payload.email_verified) {
      throw new AppError("INVALID_GOOGLE_CREDENTIAL", {
        message: "Google did not provide a verified identity.",
      });
    }

    return {
      email: payload.email,
      googleId: payload.sub,
      ...(payload.given_name !== undefined ? { firstName: payload.given_name } : {}),
      ...(payload.family_name !== undefined ? { lastName: payload.family_name } : {}),
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
