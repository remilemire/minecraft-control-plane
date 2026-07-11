// apps/backend/src/features/auth/auth.service.ts

import type { User } from "@/db/schema/index.js";
import { AppError } from "@/errors/app-error.js";
import type { InvitationService } from "@/features/invitations/invitations.service.js";
import type { SessionService } from "@/features/sessions/sessions.service.js";
import type { UserService } from "@/features/users/users.service.js";
import type {
  AuthContext,
  GoogleIdentity,
  GoogleOauthApi,
  UserWithSessionToken,
} from "./auth.types.js";

export class AuthService {
  public constructor(
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly invitationService: InvitationService,
    private readonly googleOauthClient: GoogleOauthApi,
  ) {}

  public async authenticateFromGoogle(googleToken: string): Promise<UserWithSessionToken> {
    const profile = await this.googleOauthClient.verifyCredential(googleToken);

    const user =
      (await this.userService.findByGoogleId(profile.googleId)) ??
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

  private async registerInvited({ email, ...rest }: GoogleIdentity): Promise<User> {
    if (!(await this.invitationService.isInvited(email))) {
      throw new AppError("NOT_INVITED");
    }
    return await this.userService.create({
      email,
      ...rest,
    });
  }
}
