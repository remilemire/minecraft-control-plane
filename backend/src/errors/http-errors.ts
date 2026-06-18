// backend/src/errors/http-errors.ts

import { DetailedAppError, SimpleAppError } from "./app-errors.js";
import {
  CONFLICT_DETAIL_MESSAGES,
  UNPROCESSABLE_DETAIL_MESSAGES,
  type ConflictCode,
  type UnprocessableCode,
} from "./error-messages.js";
import { ErrorStatus } from "./error-types.js";

export class BadRequestError extends SimpleAppError<ErrorStatus.BadRequest> {
  public readonly status = ErrorStatus.BadRequest;
}

export class UnauthorizedError extends SimpleAppError<ErrorStatus.Unauthorized> {
  public readonly status = ErrorStatus.Unauthorized;
}

export class ForbiddenError extends SimpleAppError<ErrorStatus.Forbidden> {
  public readonly status = ErrorStatus.Forbidden;
}

export class NotFoundError extends SimpleAppError<ErrorStatus.NotFound> {
  public readonly status = ErrorStatus.NotFound;
}

export class ConflictError extends DetailedAppError<
  ErrorStatus.Conflict,
  ConflictCode
> {
  public readonly status = ErrorStatus.Conflict;
  protected getDefaultDetailMessage(code: ConflictCode): string {
    return CONFLICT_DETAIL_MESSAGES[code]!;
  }
}

export class UnprocessableError extends DetailedAppError<
  ErrorStatus.Unprocessable,
  UnprocessableCode
> {
  public readonly status = ErrorStatus.Unprocessable;

  protected getDefaultDetailMessage(code: UnprocessableCode): string {
    return UNPROCESSABLE_DETAIL_MESSAGES[code]!;
  }
}

export class ServerError extends SimpleAppError<ErrorStatus.ServerError> {
  public readonly status = ErrorStatus.ServerError;
}
