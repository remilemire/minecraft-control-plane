// apps/backend/src/features/users/users.service.ts

import type { User } from "./users.schema.js";
import type { CreateUserInput } from "@minecraft-control-plane/shared/users";
import type { UserRepository } from "./users.repository.js";

export class UserService {
  public constructor(private readonly users: UserRepository) {}

  public async list(): Promise<User[]> {
    return await this.users.findAll();
  }

  public async create(input: CreateUserInput): Promise<User> {
    return await this.users.create(input);
  }
}
