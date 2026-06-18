// backend/src/features/auth/auth.controller.ts

import type { User } from "@/db/schema/index.js";
import {
  clearSessionCookie,
  setSessionCookie,
} from "@/features/sessions/session.cookies.js";
import { generateRandomSecret } from "@/lib/crypto.js";
import { clearCsrfCookie, setCsrfCookie } from "@/security/csrf.cookies.js";
import type { Request, Response } from "express";
import { loginSchema, registerSchema } from "./auth.schemas.js";
import type { AuthService } from "./auth.service.js";

export class AuthController {
  public constructor(private readonly authService: AuthService) {}

  public async login(req: Request, res: Response): Promise<User> {
    const input = loginSchema.parse(req.body);
    const { user, sessionToken } = await this.authService.login(input);

    setSessionCookie(res, sessionToken);
    setCsrfCookie(res, generateRandomSecret());

    return user;
  }

  public async register(req: Request, res: Response): Promise<User> {
    const input = registerSchema.parse(req.body);
    const { user, sessionToken } = await this.authService.register(input);

    setSessionCookie(res, sessionToken);
    setCsrfCookie(res, generateRandomSecret());

    return user;
  }

  public logout(res: Response): void {
    clearCsrfCookie(res);
    clearSessionCookie(res);
  }
}
