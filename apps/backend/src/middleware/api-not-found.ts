// apps/backend/src/middleware/api-not-found.ts

import { AppError } from "@/errors/index.js";
import type { RequestHandler } from "express";

// Mounted on /api right after the api router: any /api path no route matched
// lands here and becomes the JSON error envelope. Without it those requests
// would fall through to Express's HTML 404 — or, in prod, to the SPA
// fallback's index.html.
export const apiNotFound: RequestHandler = (_req, _res, next) => {
  next(new AppError("ROUTE_NOT_FOUND"));
};
