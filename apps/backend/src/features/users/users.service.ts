// apps/backend/src/features/users/users.service.ts

import { AppError } from "@/errors/app-error.js";
import type { TransactionManager } from "@/infrastructure/db/index.js";
import type { CreateUserInput } from "@minecraft-control-plane/shared/users";
import type { User } from "./users.schema.js";
import type { UserRepository } from "./users.repository.js";

export class UserService {
  public constructor(
    private readonly users: UserRepository,
    private readonly transactionManager: TransactionManager,
  ) {}

  public async list(): Promise<User[]> {
    return await this.users.findAll();
  }

  public async findByEmail(email: string): Promise<User | null> {
    return await this.users.findByEmail(email);
  }

  public async findOwner(): Promise<User | null> {
    return await this.users.findOwner();
  }

  public async create(input: CreateUserInput): Promise<User> {
    return await this.users.create(input);
  }

  public async createOwner(input: CreateUserInput): Promise<User> {
    return await this.users.create({ ...input, isOwner: true });
  }

  public async transferOwnership(currentUserId: string, targetUserId: string): Promise<User> {
    if (currentUserId === targetUserId) {
      throw new AppError("CANNOT_TRANSFER_TO_SELF");
    }

    return await this.transactionManager.run(async () => {
      if ((await this.users.findById(targetUserId)) === null) {
        throw new AppError("USER_NOT_FOUND");
      }

      // Demote before promoting — the partial unique index rejects two owners.
      // A null demotion means the caller lost ownership mid-flight.
      if ((await this.users.clearOwner(currentUserId)) === null) {
        throw new AppError("NOT_OWNER");
      }

      const promoted = await this.users.setOwner(targetUserId);
      if (promoted === null) {
        throw new AppError("USER_NOT_FOUND");
      }

      return promoted;
    });
  }
}
