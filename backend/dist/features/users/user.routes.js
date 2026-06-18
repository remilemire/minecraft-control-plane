// backend/src/features/users/user.routes.ts
import { Router } from "express";
export function createUserRoutes(userController, requireAuth) {
    const router = Router();
    router.get("/me", requireAuth, userController.getMe);
    return router;
}
//# sourceMappingURL=user.routes.js.map