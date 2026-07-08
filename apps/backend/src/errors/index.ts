// apps/backend/src/errors/index.ts

export { ApiError } from "./api-error.js";
export {
  AlreadyExistsError,
  BadRequestError,
  ForbiddenError,
  InUseError,
  NotFoundError,
  ServerError,
  UnauthorizedError,
  ValidationError,
} from "./http-errors.js";
export { translateError } from "./translation/index.js";
