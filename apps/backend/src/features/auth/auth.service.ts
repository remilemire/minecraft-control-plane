// apps/backend/src/features/auth/auth.service.ts

import { env } from "@/config/env.js";
import type { User } from "@/db/schema/index.js";
import type { TransactionRunner } from "@/db/transactions.js";
import { AppError } from "@/errors/app-error.js";
import type { InvitationService } from "@/features/invitations/invitations.service.js";
import type { SessionService } from "@/features/sessions/sessions.service.js";
import type { UserService } from "@/features/users/users.service.js";
import type { OAuthIdentityRepository } from "./oauth-identities.repository.js";
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
    private readonly oauthIdentityRepository: OAuthIdentityRepository,
    private readonly transactionRunner: TransactionRunner,
  ) {}

  public async authenticateWithOAuth({
    credential,
    provider,
  }: OAuthData): Promise<UserWithSessionToken> {
    const profile = await this.oauthClients[provider].verifyCredential(credential);

    const found = await this.oauthIdentityRepository.findBySubjectWithUser(
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

    if (!isAdmin && !(await this.invitationService.isInvited(email))) {
      throw new AppError("NOT_INVITED");
    }

    const input = {
      email,
      ...(identity.firstName !== undefined ? { firstName: identity.firstName } : {}),
      ...(identity.lastName !== undefined ? { lastName: identity.lastName } : {}),
    };

    // Registering a new user and linking their first OAuth identity is a
    // single unit of work: either both rows exist afterward or neither does.
    return await this.transactionRunner.run(async (tx) => {
      const userService = this.userService.withTx(tx);
      const user = isAdmin
        ? await userService.bootstrapAdmin(input)
        : await userService.create(input);

      await this.oauthIdentityRepository.withTx(tx).create({
        userId: user.id,
        provider,
        subject: providerSubject,
      });

      return user;
    });
  }
}
