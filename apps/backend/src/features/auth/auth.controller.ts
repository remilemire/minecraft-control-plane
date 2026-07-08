// apps/backend/src/features/auth/auth.controller.ts

import {
  clearSessionCookie,
  getSessionCookie,
  setSessionCookie,
} from "@/features/sessions/sessions.cookies.js";
import { generateRandomSecret } from "@/lib/crypto.js";
import { clearCsrfCookie, setCsrfCookie } from "@/security/csrf.js";
import {
  type UserResponse,
  googleLoginSchema,
  userResponseSchema,
} from "@minecraft-server/shared/schemas";
import type { Request, Response } from "express";
import type { AuthService } from "./auth.service.js";

export class AuthController {
  public constructor(private readonly authService: AuthService) {}

  public async googleLogin(req: Request, res: Response): Promise<UserResponse> {
    const { credential } = googleLoginSchema.parse(req.body);

    const { user, sessionToken } = await this.authService.authenticateFromGoogle(credential);

    setSessionCookie(res, sessionToken);
    setCsrfCookie(res, generateRandomSecret());

    return userResponseSchema.parse(user);
  }

  public async logout(req: Request, res: Response): Promise<void> {
    const sessionToken = getSessionCookie(req);
    if (sessionToken !== undefined) {
      await this.authService.logout(sessionToken);
    }

    clearCsrfCookie(res);
    clearSessionCookie(res);
  }
}
