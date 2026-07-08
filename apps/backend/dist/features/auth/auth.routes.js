// apps/backend/src/features/auth/auth.routes.ts
import { requireCsrf } from "@/security/csrf.js";
import { Router } from "express";
export function createAuthRoutes(authController, requireAuth) {
    const router = Router();
    router.post("/google", authController.googleLogin);
    router.post("/logout", requireCsrf, requireAuth, authController.logout);
    return router;
}
//# sourceMappingURL=auth.routes.js.map