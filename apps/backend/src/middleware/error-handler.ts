// apps/backend/src/middleware/error-handler.ts

import { env } from "@/config/env.js";
import { translateError } from "@/errors/translator.js";
import type { ErrorRequestHandler } from "express";

// Express only treats a middleware as an error handler when it declares
// exactly four parameters, so `_next` must stay even though it is unused.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- see above
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const response = translateError(error);

  // Debug logs everything; prod must still surface server faults — before
  // this condition a prod process logged nothing at all.
  if (env.DEBUG || response.status >= 500) {
    console.error(error);
  }

  res.status(response.status).json(response.body);
};
