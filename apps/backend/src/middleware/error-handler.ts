// apps/backend/src/middleware/error-handler.ts

import { translateError } from "@/errors/index.js";
import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _req, res) => {
  const response = translateError(error).toResponse();
  res.status(response.status).json(response.body);
};
