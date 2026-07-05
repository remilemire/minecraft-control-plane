// apps/backend/src/errors/error-catalog.ts

import type { ErrorCatalog } from "./types.js";

export const ERROR_CATALOG = {
  BAD_REQUEST: {
    status: 400,
    message: "The request could not be processed.",
  },
  UNAUTHORIZED: {
    status: 401,
    message: "Authentication required.",
  },
  FORBIDDEN: {
    status: 403,
    message: "You do not have permission to perform this action.",
  },
  NOT_FOUND: {
    status: 404,
    message: "The requested resource could not be found.",
  },
  ALREADY_EXISTS: {
    status: 409,
    message: "Item already exists.",
  },
  IN_USE: {
    status: 409,
    message: "Item in use.",
  },
  VALIDATION: {
    status: 422,
    message: "There was a problem with the submission.",
  },
  UNKNOWN: {
    status: 500,
    message: "Something went wrong.",
  },
} as const satisfies ErrorCatalog;

export type ErrorCode = keyof typeof ERROR_CATALOG;
