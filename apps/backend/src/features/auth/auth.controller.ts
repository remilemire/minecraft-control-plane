// apps/backend/src/features/auth/auth.controller.ts

import { clearCsrfCookie, setCsrfCookie } from "@/http/csrf/csrf.cookies.js";
import {
  clearSessionCookie,
  getSessionCookie,
  setSessionCookie,
} from "@/http/session/session.cookies.js";
import { generateRandomSecret } from "@/lib/tokens.js";
import { parseOrThrow } from "@/validation/parse.js";
import { googleLoginSchema } from "@minecraft-server/shared/auth";
import { userResponseSchema } from "@minecraft-server/shared/users";
import type { Request, Response } from "express";
import type { AuthService } from "./auth.service.js";

export class AuthController {
  public constructor(private readonly authService: AuthService) {}

  public googleLogin = async (req: Request, res: Response): Promise<void> => {
    const { credential } = parseOrThrow(googleLoginSchema, req.body);

    const { user, sessionToken } = await this.authService.authenticateFromGoogle(credential);

    setSessionCookie(res, sessionToken);
    setCsrfCookie(res, generateRandomSecret());

    res.status(200).json(userResponseSchema.parse(user));
  };

  public logout = async (req: Request, res: Response): Promise<void> => {
    const sessionToken = getSessionCookie(req);
    if (sessionToken !== undefined) {
      await this.authService.logout(sessionToken);
    }

    clearCsrfCookie(res);
    clearSessionCookie(res);

    res.status(204).send();
  };
}
