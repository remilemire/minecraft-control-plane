// apps/backend/src/features/auth/auth.routes.ts
import { requireCsrf } from "../../http/csrf/csrf.middleware.js";
import { Router } from "express";
export function createAuthRoutes(authController, requireAuth) {
    const router = Router();
    router.post("/google", authController.googleLogin);
    router.post("/logout", requireAuth, requireCsrf, authController.logout);
    return router;
}
//# sourceMappingURL=auth.routes.js.map