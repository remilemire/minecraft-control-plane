// apps/backend/src/features/users/users.service.ts

import type { User } from "@/db/schema/users.js";
import type { CreateUserInput } from "@minecraft-server/shared/users";
import type { UserRepository } from "./users.repository.js";

export class UserService {
  public constructor(private readonly users: UserRepository) {}

  public async findByGoogleId(googleId: string): Promise<User | null> {
    return await this.users.findByGoogleId(googleId);
  }

  public async create(input: CreateUserInput): Promise<User> {
    return await this.users.create(input);
  }
}
