// apps/backend/src/errors/app-errors.ts
import { PUBLIC_ERROR_MESSAGES } from "./error-messages.js";
import { ErrorStatus } from "./error-types.js";
export class SimpleAppError extends Error {
  get publicMessage() {
    return PUBLIC_ERROR_MESSAGES[this.status];
  }
  constructor(message, options) {
    super(message, options);
    this.name = this.constructor.name;
  }
  toResponse() {
    return {
      status: this.status,
      message: this.publicMessage,
    };
  }
}
export class DetailedAppError extends SimpleAppError {
  details;
  constructor(message, options) {
    const { details, ...rest } = options ?? {};
    super(message, rest);
    if (details !== undefined) {
      this.details = details;
    }
  }
  toResponse() {
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
}
//# sourceMappingURL=app-errors.js.map
