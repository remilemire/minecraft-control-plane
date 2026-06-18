// backend/src/features/auth/auth.service.ts
import { UnauthorizedError } from "@/errors/index.js";
import { hashPassword, verifyPassword, } from "@/features/auth/auth.passwords.js";
export class AuthService {
    userService;
    sessionService;
    constructor(userService, sessionService) {
        this.userService = userService;
        this.sessionService = sessionService;
    }
    async login({ email, password, }) {
        let user;
        try {
            user = await this.userService.getByEmail(email);
            if (!verifyPassword(password, user.passwordHash)) {
                throw new Error();
            }
        }
        catch {
            throw new UnauthorizedError("Incorrect email or password.");
        }
        const { sessionToken } = await this.sessionService.create({
            userId: user.id,
        });
        return { user, sessionToken };
    }
    async register({ email, password, ...rest }) {
        const passwordHash = await hashPassword(password);
        const user = await this.userService.create({
            email,
            passwordHash,
            ...rest,
        });
        const { sessionToken } = await this.sessionService.create({
            userId: user.id,
        });
        return { user, sessionToken };
    }
    async authenticate(sessionToken) {
        const result = await this.sessionService.findValidByTokenWithUser(sessionToken);
        if (result === null) {
            throw new UnauthorizedError("Session expired.");
        }
        const { user, session } = result;
        return { user, session };
    }
}
//# sourceMappingURL=auth.service.js.map