// backend/src/errors/app-errors.ts

import { PUBLIC_ERROR_MESSAGES } from "./error-messages.js";
import {
  ErrorStatus,
  type DetailedErrorResponse,
  type ErrorDetail,
  type SimpleErrorResponse,
} from "./error-types.js";

export abstract class SimpleAppError<Status extends ErrorStatus> extends Error {
  public abstract readonly status: Status;

  public get publicMessage() {
    return PUBLIC_ERROR_MESSAGES[this.status];
  }

  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }

  public toResponse(): SimpleErrorResponse<Status> {
    return {
      status: this.status,
      message: this.publicMessage,
    };
  }
}

export interface DetailedAppErrorOptions<
  Code extends string,
> extends ErrorOptions {
  readonly details?: ErrorDetail<Code>[];
}

export abstract class DetailedAppError<
  Status extends ErrorStatus,
  Code extends string,
> extends SimpleAppError<Status> {
  public readonly details?: ErrorDetail<Code>[];

  public constructor(
    message?: string,
    options?: DetailedAppErrorOptions<Code>,
  ) {
    const { details, ...rest } = options ?? {};

    super(message, rest);

    if (details !== undefined) {
      this.details = details;
    }
  }

  public override toResponse(): DetailedErrorResponse<Status, Code> {
    if (this.details === undefined) {
      return super.toResponse();
    }

    const details = this.details.map((detail) => ({
      ...detail,
      message: detail.message ?? this.getDefaultDetailMessage(detail.code),
    }));

    return {
      ...super.toResponse(),
      details: details,
    };
  }

  protected abstract getDefaultDetailMessage(code: Code): string;
}
