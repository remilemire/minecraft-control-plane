// backend/src/errors/error-types.ts

export enum ErrorStatus {
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  Conflict = 409,
  Unprocessable = 422,
  ServerError = 500,
}

export interface ErrorDetail<Code extends string> {
  readonly field?: string;
  readonly message?: string;
  readonly code: Code;
}

export interface SimpleErrorResponse<Status extends ErrorStatus> {
  readonly status: Status;
  readonly message: string;
}

export interface DetailedErrorResponse<
  Status extends ErrorStatus,
  Code extends string,
> extends SimpleErrorResponse<Status> {
  readonly details?: ErrorDetail<Code>[];
}
