// apps/backend/src/features/auth/auth.controller.ts
import { clearSessionCookie, getSessionCookie, setSessionCookie, } from "@/features/sessions/sessions.cookies.js";
import { generateRandomSecret } from "@/lib/crypto.js";
import { clearCsrfCookie, setCsrfCookie } from "@/security/csrf.js";
import { googleLoginSchema, userResponseSchema, } from "@minecraft-server/shared/schemas";
export class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async googleLogin(req, res) {
        const { credential } = googleLoginSchema.parse(req.body);
        const { user, sessionToken } = await this.authService.authenticateFromGoogle(credential);
        setSessionCookie(res, sessionToken);
        setCsrfCookie(res, generateRandomSecret());
        return userResponseSchema.parse(user);
    }
    async logout(req, res) {
        const sessionToken = getSessionCookie(req);
        if (sessionToken !== undefined) {
            await this.authService.logout(sessionToken);
        }
        clearCsrfCookie(res);
        clearSessionCookie(res);
    }
}
//# sourceMappingURL=auth.controller.js.map