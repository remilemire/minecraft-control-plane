// apps/backend/src/middleware/error-handler.ts

import { env } from "@/config/env.js";
import { translateError } from "@/errors/translator.js";
import type { ErrorRequestHandler } from "express";

// Express only treats a middleware as an error handler when it declares
// exactly four parameters, so `_next` must stay even though it is unused.
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (env.DEBUG) {
    console.log(error);
  }

  const response = translateError(error);
  res.status(response.status).json(response.body);
};
