// backend/src/features/auth/auth.service.ts

import { UnauthorizedError } from "@/errors/index.js";
import {
  hashPassword,
  verifyPassword,
} from "@/features/auth/auth.passwords.js";
import type { SessionService } from "@/features/sessions/session.service.js";
import type { SessionToken } from "@/features/sessions/session.types.js";
import type { UserService } from "@/features/users/user.service.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";
import type { AuthContext, UserWithSessionToken } from "./auth.types.js";

export class AuthService {
  public constructor(
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
  ) {}

  public async login({
    email,
    password,
  }: LoginInput): Promise<UserWithSessionToken> {
    let user;
    try {
      user = await this.userService.getByEmail(email);

      if (!verifyPassword(password, user.passwordHash)) {
        throw new Error();
      }
    } catch {
      throw new UnauthorizedError("Incorrect email or password.");
    }

    const { sessionToken } = await this.sessionService.create({
      userId: user.id,
    });

    return { user, sessionToken };
  }

  public async register({
    email,
    password,
    ...rest
  }: RegisterInput): Promise<UserWithSessionToken> {
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

  public async authenticate(sessionToken: SessionToken): Promise<AuthContext> {
    const result =
      await this.sessionService.findValidByTokenWithUser(sessionToken);

    if (result === null) {
      throw new UnauthorizedError("Session expired.");
    }

    const { user, session } = result;
    return { user, session };
  }
}
