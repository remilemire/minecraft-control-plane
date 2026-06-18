// backend/src/features/auth/auth.routes.ts
import { Router } from "express";
export function createAuthRoutes(authController, requireAuth) {
    const router = Router();
    router.post("/login", authController.login);
    router.post("/register", authController.register);
    router.post("/logout", requireAuth, authController.logout);
    return router;
}
//# sourceMappingURL=auth.routes.js.map