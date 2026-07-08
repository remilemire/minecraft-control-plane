// apps/backend/src/features/auth/auth.service.ts
import { env } from "@/config/env.js";
import { ForbiddenError, UnauthorizedError } from "@/errors/index.js";
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
        const profile = await this.verifyGoogleToken(googleToken);
        const user = (await this.userService.findByGoogleId(profile.email)) ??
            (await this.registerInvited(profile));
        const { sessionToken } = await this.sessionService.create({
            userId: user.id,
        });
        return { user, sessionToken };
    }
    async authenticateFromSession(sessionToken) {
        const result = await this.sessionService.findValidWithUser(sessionToken);
        if (result === null) {
            throw new UnauthorizedError("Invalid or expired session.");
        }
        const { user, session } = result;
        return { user, session };
    }
    async logout(sessionToken) {
        await this.sessionService.delete(sessionToken);
    }
    async registerInvited({ email, ...rest }) {
        if (!this.invitationService.isInvited(email)) {
            throw new ForbiddenError("Invite only.");
        }
        return await this.userService.create({
            email,
            ...rest,
        });
    }
    async verifyGoogleToken(googleToken) {
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
//# sourceMappingURL=auth.service.js.map