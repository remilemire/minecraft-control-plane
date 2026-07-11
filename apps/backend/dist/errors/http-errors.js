// apps/backend/src/errors/http-errors.ts
import { ApiError } from "./api-error.js";
export class BadRequestError extends ApiError {
  constructor(message, options = {}) {
    super("BAD_REQUEST", message, options);
  }
}
export class UnauthorizedError extends ApiError {
  constructor(message, options = {}) {
    super("UNAUTHORIZED", message, options);
  }
}
export class ForbiddenError extends ApiError {
  constructor(message, options = {}) {
    super("FORBIDDEN", message, options);
  }
}
export class NotFoundError extends ApiError {
  constructor(message, options = {}) {
    super("NOT_FOUND", message, options);
  }
}
export class AlreadyExistsError extends ApiError {
  constructor(message, options = {}) {
    super("ALREADY_EXISTS", message, options);
  }
}
export class InUseError extends ApiError {
  constructor(message, options = {}) {
    super("IN_USE", message, options);
  }
}
export class ValidationError extends ApiError {
  constructor(message, options = {}) {
    super("VALIDATION", message, options);
  }
}
export class ServerError extends ApiError {
  constructor(message, options = {}) {
    super("SERVER", message, options);
  }
}
//# sourceMappingURL=http-errors.js.map
