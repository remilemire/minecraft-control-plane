// apps/backend/src/features/auth/auth.service.ts
import { AppError } from "../../errors/app-error.js";
export class AuthService {
  userService;
  sessionService;
  invitationService;
  googleOauthClient;
  constructor(userService, sessionService, invitationService, googleOauthClient) {
    this.userService = userService;
    this.sessionService = sessionService;
    this.invitationService = invitationService;
    this.googleOauthClient = googleOauthClient;
  }
  async authenticateFromGoogle(googleToken) {
    const profile = await this.googleOauthClient.verifyCredential(googleToken);
    const user =
      (await this.userService.findByGoogleId(profile.googleId)) ??
      (await this.registerInvited(profile));
    const { sessionToken } = await this.sessionService.create({
      userId: user.id,
    });
    return { user, sessionToken };
  }
  async authenticateFromSession(sessionToken) {
    const result = await this.sessionService.findValidWithUser(sessionToken);
    if (result === null) {
      throw new AppError("INVALID_SESSION");
    }
    const { user, session } = result;
    return { user, session };
  }
  async logout(sessionToken) {
    await this.sessionService.delete(sessionToken);
  }
  async registerInvited({ email, ...rest }) {
    if (!(await this.invitationService.isInvited(email))) {
      throw new AppError("NOT_INVITED");
    }
    return await this.userService.create({
      email,
      ...rest,
    });
  }
}
//# sourceMappingURL=auth.service.js.map
