// apps/backend/src/features/auth/auth.service.ts

import { env } from "@/config/env.js";
import type { User } from "@/db/schema/index.js";
import { AppError } from "@/errors/app-error.js";
import type { InvitationService } from "@/features/invitations/invitations.service.js";
import type { SessionService } from "@/features/sessions/sessions.service.js";
import type { UserService } from "@/features/users/users.service.js";
import type {
  AuthContext,
  ExternalIdentity,
  OAuthClients,
  OAuthData,
  UserWithSessionToken,
} from "./auth.types.js";

export class AuthService {
  public constructor(
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly invitationService: InvitationService,
    private readonly oauthClients: OAuthClients,
  ) {}

  public async authenticateWithOAuth({
    credential,
    provider,
  }: OAuthData): Promise<UserWithSessionToken> {
    const profile = await this.oauthClients[provider].verifyCredential(credential);

    const user =
      (await this.userService.findByGoogleId(profile.providerSubject)) ??
      (await this.registerInvited(profile));

    const { sessionToken } = await this.sessionService.create({
      userId: user.id,
    });

    return { user, sessionToken };
  }

  public async authenticateFromSession(sessionToken: string): Promise<AuthContext> {
    const result = await this.sessionService.findValidWithUser(sessionToken);

    if (result === null) {
      throw new AppError("INVALID_SESSION");
    }

    const { user, session } = result;
    return { user, session };
  }

  public async logout(sessionToken: string): Promise<void> {
    await this.sessionService.delete(sessionToken);
  }

  private async registerInvited(identity: ExternalIdentity): Promise<User> {
    const { email } = identity;
    // The provider-agnostic identity maps onto the user record, whose column is
    // still `googleId` (the subject id of the linked account).
    const input = {
      email,
      googleId: identity.providerSubject,
      ...(identity.firstName !== undefined ? { firstName: identity.firstName } : {}),
      ...(identity.lastName !== undefined ? { lastName: identity.lastName } : {}),
    };

    if (email === env.ADMIN_EMAIL) {
      return await this.userService.bootstrapAdmin(input);
    }

    if (!(await this.invitationService.isInvited(email))) {
      throw new AppError("NOT_INVITED");
    }

    return await this.userService.create(input);
  }
}
