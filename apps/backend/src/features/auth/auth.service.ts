// apps/backend/src/features/auth/auth.service.ts

import { env } from "@/config/env.js";
import type { User } from "@/db/schema/index.js";
import { ForbiddenError, UnauthorizedError } from "@/errors/index.js";
import type { InvitationService } from "@/features/invitations/invitations.service.js";
import type { SessionService } from "@/features/sessions/sessions.service.js";
import type { UserService } from "@/features/users/users.service.js";
import type { OAuth2Client } from "google-auth-library";
import type { AuthContext, GoogleIdentity, UserWithSessionToken } from "./auth.types.js";

export class AuthService {
  public constructor(
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly invitationService: InvitationService,
    private readonly googleOauthClient: OAuth2Client,
  ) {}

  public async authenticateFromGoogle(googleToken: string): Promise<UserWithSessionToken> {
    const profile = await this.verifyGoogleToken(googleToken);

    const user =
      (await this.userService.findByGoogleId(profile.email)) ??
      (await this.registerInvited(profile));

    const { sessionToken } = await this.sessionService.create({
      userId: user.id,
    });

    return { user, sessionToken };
  }

  public async authenticateFromSession(sessionToken: string): Promise<AuthContext> {
    const result = await this.sessionService.findValidWithUser(sessionToken);

    if (result === null) {
      throw new UnauthorizedError("Invalid or expired session.");
    }

    const { user, session } = result;
    return { user, session };
  }

  public async logout(sessionToken: string): Promise<void> {
    await this.sessionService.delete(sessionToken);
  }

  private async registerInvited({ email, ...rest }: GoogleIdentity): Promise<User> {
    if (!this.invitationService.isInvited(email)) {
      throw new ForbiddenError("Invite only.");
    }
    return await this.userService.create({
      email,
      ...rest,
    });
  }

  private async verifyGoogleToken(googleToken: string): Promise<GoogleIdentity> {
    const ticket = await this.googleOauthClient.verifyIdToken({
      idToken: googleToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (payload === undefined) {
      throw new UnauthorizedError("The Google credential is invalid or expired.");
    }
    if (payload.email === undefined || !payload.email_verified) {
      throw new UnauthorizedError("Google did not provide a verified identity.");
    }

    return {
      email: payload.email,
      googleId: payload.sub,
      ...(payload.given_name !== undefined ? { firstName: payload.given_name } : {}),
      ...(payload.family_name !== undefined ? { lastName: payload.family_name } : {}),
    };
  }
}
