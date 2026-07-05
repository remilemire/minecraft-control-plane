// apps/backend/src/errors/http-errors.ts
import { DetailedAppError, SimpleAppError } from "./app-errors.js";
import { CONFLICT_DETAIL_MESSAGES, UNPROCESSABLE_DETAIL_MESSAGES, } from "./error-messages.js";
import { ErrorStatus } from "./error-types.js";
export class BadRequestError extends SimpleAppError {
    status = ErrorStatus.BadRequest;
}
export class UnauthorizedError extends SimpleAppError {
    status = ErrorStatus.Unauthorized;
}
export class ForbiddenError extends SimpleAppError {
    status = ErrorStatus.Forbidden;
}
export class NotFoundError extends SimpleAppError {
    status = ErrorStatus.NotFound;
}
export class ConflictError extends DetailedAppError {
    status = ErrorStatus.Conflict;
    getDefaultDetailMessage(code) {
        return CONFLICT_DETAIL_MESSAGES[code];
    }
}
export class UnprocessableError extends DetailedAppError {
    status = ErrorStatus.Unprocessable;
    getDefaultDetailMessage(code) {
        return UNPROCESSABLE_DETAIL_MESSAGES[code];
    }
}
export class ServerError extends SimpleAppError {
    status = ErrorStatus.ServerError;
}
//# sourceMappingURL=http-errors.js.map