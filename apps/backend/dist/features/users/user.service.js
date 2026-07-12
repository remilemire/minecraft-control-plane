// apps/backend/src/features/users/user.service.ts
import { isUniqueViolation } from "../../db/errors.js";
import { ConflictError, NotFoundError } from "../../errors/http-errors.js";
export class UserService {
  users;
  constructor(users) {
    this.users = users;
  }
  async getByEmail(email) {
    const user = await this.users.findByEmail(email);
    if (user === null) {
      throw new NotFoundError(`User not found.`);
    }
    return user;
  }
  async create(input) {
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
//# sourceMappingURL=user.service.js.map
