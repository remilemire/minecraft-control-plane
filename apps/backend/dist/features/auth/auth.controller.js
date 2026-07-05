// apps/backend/src/features/auth/auth.controller.ts
import { clearSessionCookie, setSessionCookie, } from "@/features/sessions/session.cookies.js";
import { generateRandomSecret } from "@/lib/crypto.js";
import { clearCsrfCookie, setCsrfCookie } from "@/security/csrf.cookies.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";
export class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async login(req, res) {
        const input = loginSchema.parse(req.body);
        const { user, sessionToken } = await this.authService.login(input);
        setSessionCookie(res, sessionToken);
        setCsrfCookie(res, generateRandomSecret());
        return user;
    }
    async register(req, res) {
        const input = registerSchema.parse(req.body);
        const { user, sessionToken } = await this.authService.register(input);
        setSessionCookie(res, sessionToken);
        setCsrfCookie(res, generateRandomSecret());
        return user;
    }
    logout(res) {
        clearCsrfCookie(res);
        clearSessionCookie(res);
    }
}
//# sourceMappingURL=auth.controller.js.map