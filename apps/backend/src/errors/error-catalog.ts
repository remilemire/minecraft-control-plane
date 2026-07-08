// apps/backend/src/errors/error-catalog.ts

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500;

export type ErrorCatalog = {
  readonly [code: string]: {
    readonly status: ErrorStatus;
    readonly message: string;
  };
};

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
  SERVER: {
    status: 500,
    message: "Something went wrong.",
  },
} as const satisfies ErrorCatalog;

export type ErrorCode = keyof typeof ERROR_CATALOG;
