// apps/backend/src/errors/http-errors.ts

import type { ApiErrorOptions } from "./api-error.js";
import { ApiError } from "./api-error.js";

type SimpleApiErrorOptions = Omit<ApiErrorOptions, "errors">;

export class BadRequestError extends ApiError {
  public constructor(message?: string, options: SimpleApiErrorOptions = {}) {
    super("BAD_REQUEST", message, options);
  }
}

export class UnauthorizedError extends ApiError {
  public constructor(message?: string, options: SimpleApiErrorOptions = {}) {
    super("UNAUTHORIZED", message, options);
  }
}

export class ForbiddenError extends ApiError {
  public constructor(message?: string, options: SimpleApiErrorOptions = {}) {
    super("FORBIDDEN", message, options);
  }
}

export class NotFoundError extends ApiError {
  public constructor(message?: string, options: SimpleApiErrorOptions = {}) {
    super("NOT_FOUND", message, options);
  }
}

export class AlreadyExistsError extends ApiError {
  public constructor(message?: string, options: SimpleApiErrorOptions = {}) {
    super("ALREADY_EXISTS", message, options);
  }
}

export class InUseError extends ApiError {
  public constructor(message?: string, options: SimpleApiErrorOptions = {}) {
    super("IN_USE", message, options);
  }
}

export class ValidationError extends ApiError {
  public constructor(message?: string, options: ApiErrorOptions = {}) {
    super("VALIDATION", message, options);
  }
}

export class ServerError extends ApiError {
  public constructor(message?: string, options: SimpleApiErrorOptions = {}) {
    super("SERVER", message, options);
  }
}
