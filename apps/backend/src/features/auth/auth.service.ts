// apps/backend/src/features/auth/auth.service.ts

import { env } from "@/config/env.js";
import type { User } from "@/infrastructure/db/schema/index.js";
import type { TransactionManager } from "@/infrastructure/db/transaction/index.js";
import { AppError } from "@/errors/app-error.js";
import type { InvitationService } from "@/features/invitations/invitations.service.js";
import type { UserService } from "@/features/users/users.service.js";
import type { OAuthIdentityService } from "./oauth-identities/oauth-identities.service.js";
import type { SessionService } from "./sessions/sessions.service.js";
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
    private readonly oauthIdentityService: OAuthIdentityService,
    private readonly transactionManager: TransactionManager,
  ) {}

  public async authenticateWithOAuth({
    credential,
    provider,
  }: OAuthData): Promise<UserWithSessionToken> {
    const profile = await this.oauthClients[provider].verifyCredential(credential);

    const found = await this.oauthIdentityService.findBySubjectWithUser(
      provider,
      profile.providerSubject,
    );
    const user = found !== null ? found.user : await this.registerInvited(profile);

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
    const { email, provider, providerSubject } = identity;
    const isAdmin = email === env.ADMIN_EMAIL;

    const invitation = isAdmin ? null : await this.invitationService.findPending(email);
    if (!isAdmin && invitation === null) {
      throw new AppError("NOT_INVITED");
    }

    const input = {
      email,
      ...(identity.fullName !== undefined ? { fullName: identity.fullName } : {}),
    };

    // Registering a new user, linking their first OAuth identity, and
    // consuming their invitation is a single unit of work: either all of it
    // happened afterward or none of it did.
    return await this.transactionManager.run(async () => {
      const user = isAdmin
        ? await this.userService.bootstrapAdmin(input)
        : await this.userService.create(input);

      await this.oauthIdentityService.create({
        userId: user.id,
        provider,
        subject: providerSubject,
      });

      if (invitation !== null) {
        await this.invitationService.markAccepted(invitation.id, { acceptedByUserId: user.id });
      }

      return user;
    });
  }
}
