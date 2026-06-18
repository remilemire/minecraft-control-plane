// backend/src/features/users/user.controller.ts
import { UnauthorizedError } from "@/errors/http-errors.js";
export class UserController {
    userService;
    constructor(userService) {
        this.userService = userService;
    }
    async getMe(req) {
        if (req.user === undefined) {
            throw new UnauthorizedError();
        }
        return req.user;
    }
}
//# sourceMappingURL=user.controller.js.map