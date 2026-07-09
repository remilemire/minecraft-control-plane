// apps/backend/src/middleware/error-handler.ts

import { translateError } from "@/errors/translate-error.js";
import type { ErrorRequestHandler } from "express";

// Express only treats a middleware as an error handler when it declares
// exactly four parameters, so `_next` must stay even though it is unused.
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const response = translateError(error).toResponse();
  res.status(response.status).json(response.body);
};
