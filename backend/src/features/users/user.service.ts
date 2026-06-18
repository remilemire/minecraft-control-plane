// backend/src/features/users/user.service.ts

import { isUniqueViolation } from "@/db/errors.js";
import type { User } from "@/db/schema/users.js";
import { ConflictError, NotFoundError } from "@/errors/http-errors.js";
import type { UserRepository } from "./user.repository.js";
import type { CreateUserData } from "./user.types.js";

export class UserService {
  public constructor(private readonly users: UserRepository) {}

  public async getByEmail(email: string): Promise<User> {
    const user = await this.users.findByEmail(email);
    if (user === null) {
      throw new NotFoundError(`User not found.`);
    }
    return user;
  }

  public async create(input: CreateUserData): Promise<User> {
    try {
      const user = await this.users.create(input);
      return user;
    } catch (error) {
      if (isUniqueViolation(error, "users_email_unique")) {
        throw new ConflictError(`Email already in use.`, {
          details: [{ field: "email", code: "unique" }],
          cause: error,
        });
      }

      throw error;
    }
  }
}
