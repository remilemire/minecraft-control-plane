// backend/src/middleware/error-handler.ts

import type { ErrorRequestHandler } from "express";
import { ServerError, SimpleAppError } from "@/errors/index.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res) => {
  if (error instanceof SimpleAppError) {
    res.status(error.status).json(error.toResponse());
    return;
  }

  const serverError = new ServerError("Unexpected server error.");
  res.status(serverError.status).json(serverError.toResponse());
};
