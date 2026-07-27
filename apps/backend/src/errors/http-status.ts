// apps/backend/src/errors/http-status.ts

import type { ErrorKind } from "@minecraft-control-plane/shared/common";

export const ERROR_KIND_TO_HTTP_STATUS = {
  CONFLICT: 409,
  FORBIDDEN: 403,
  INTERNAL: 500,
  NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 503,
  UNAUTHORIZED: 401,
  VALIDATION: 422,
} as const satisfies Record<ErrorKind, number>;

export type HttpErrorStatus = (typeof ERROR_KIND_TO_HTTP_STATUS)[ErrorKind];
