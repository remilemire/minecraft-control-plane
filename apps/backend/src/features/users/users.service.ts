// apps/backend/src/features/users/users.service.ts

import type { Tx } from "@/db/transactions.js";
import type { User } from "@/db/schema/index.js";
import type { CreateUserInput } from "@minecraft-server/shared/users";
import type { UserRepository } from "./users.repository.js";

export class UserService {
  public constructor(private readonly users: UserRepository) {}

  public withTx(tx: Tx): UserService {
    return new UserService(this.users.withTx(tx));
  }

  public async list(): Promise<User[]> {
    return await this.users.findAll();
  }

  public async create(input: CreateUserInput): Promise<User> {
    return await this.users.create(input);
  }

  public async bootstrapAdmin(input: CreateUserInput): Promise<User> {
    return await this.users.create({ ...input, isAdmin: true });
  }
}
