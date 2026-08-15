// apps/backend/src/features/auth/auth.service.ts

import { env } from "@/config/env.js";
import type { User } from "@/infrastructure/db/schemas.js";
import type { TransactionManager } from "@/infrastructure/db/index.js";
import { AppError } from "@/errors/app-error.js";
import type { UserService } from "@/features/users/users.service.js";
import { emailSchema } from "@minecraft-control-plane/shared/common";
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
    private readonly oauthClients: OAuthClients,
    private readonly oauthIdentityService: OAuthIdentityService,
    private readonly transactionManager: TransactionManager,
  ) {}

  public async authenticateWithOAuth({
    credential,
    provider,
  }: OAuthData): Promise<UserWithSessionToken> {
    const profile = await this.oauthClients[provider].verifyCredential(credential);

    // Providers may vary casing; users.email and BOOTSTRAP_OWNER_EMAIL are
    // both stored normalized, so normalize before any comparison.
    const parsedEmail = emailSchema.safeParse(profile.email);
    if (!parsedEmail.success) {
      throw new AppError("AUTHENTICATION_FAILED");
    }
    const identity: ExternalIdentity = { ...profile, email: parsedEmail.data };

    const found = await this.oauthIdentityService.findBySubjectWithUser(
      provider,
      identity.providerSubject,
    );
    const user = found !== null ? found.user : await this.registerFirstLogin(identity);

    // A null lastLoginAt marks the first sign-in ever: adopt the provider's
    // display name then (owner-provisioned rows have none). Keying on the
    // column, not the code path, makes an interrupted claim self-healing —
    // the next login still counts as the first.
    const isFirstLogin = user.lastLoginAt === null;
    const loggedIn = await this.userService
      .recordLogin(user.id, isFirstLogin ? identity.fullName : undefined)
      .catch((error: unknown) => {
        // The user row vanishing mid-login is a conflict like any other:
        // login stays single-coded.
        if (error instanceof AppError && error.code === "USER_NOT_FOUND") {
          throw new AppError("AUTHENTICATION_FAILED", { cause: error });
        }
        throw error;
      });

    const { sessionToken } = await this.sessionService.create({
      userId: loggedIn.id,
    });

    return { user: loggedIn, sessionToken };
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

  private async registerFirstLogin(identity: ExternalIdentity): Promise<User> {
    const { email, provider, providerSubject } = identity;

    // Owners provision users ahead of time; the first sign-in with a matching
    // email claims the account by linking this identity to it.
    const existing = await this.userService.findByEmail(email);
    if (existing !== null) {
      await this.oauthIdentityService.create({
        userId: existing.id,
        provider,
        subject: providerSubject,
      });
      return existing;
    }

    // The bootstrap owner email may create the very first account — as the
    // owner — but only while no owner exists. Everyone else must have been
    // provisioned. One failure code for every cause (unknown email included):
    // anything more specific would let callers enumerate registered emails.
    const canBootstrapOwner =
      email === env.BOOTSTRAP_OWNER_EMAIL && (await this.userService.findOwner()) === null;
    if (!canBootstrapOwner) {
      throw new AppError("AUTHENTICATION_FAILED");
    }

    const input = {
      email,
      ...(identity.fullName !== undefined ? { fullName: identity.fullName } : {}),
    };

    try {
      // Creating the owner and linking their first OAuth identity is a single
      // unit of work: either both happened afterward or neither did.
      return await this.transactionManager.run(async () => {
        const user = await this.userService.createOwner(input);

        await this.oauthIdentityService.create({
          userId: user.id,
          provider,
          subject: providerSubject,
        });

        return user;
      });
    } catch (error) {
      // A concurrent bootstrap can beat the reads above to the insert; the
      // database invariants surface that as a conflict, but login stays
      // single-coded — a retry lands in the link path.
      if (
        error instanceof AppError &&
        (error.code === "EMAIL_TAKEN" || error.code === "OWNER_ALREADY_EXISTS")
      ) {
        throw new AppError("AUTHENTICATION_FAILED", { cause: error });
      }
      throw error;
    }
  }
}
