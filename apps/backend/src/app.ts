// apps/backend/src/app.ts

// Must stay the first import: zod v4 copies base methods onto schemas at
// construction, so .openapi() has to exist before any schema module (notably
// @minecraft-control-plane/shared via the controllers) is evaluated.
import "./openapi/zod-extend.js";

import cookieParser from "cookie-parser";
import express from "express";
import type { Router } from "express";

import { apiNotFound } from "./middleware/api-not-found.js";
import { errorHandler } from "./middleware/error-handler.js";
import { env } from "./config/env.js";
import { createOpenApiRoutes } from "./openapi/openapi.routes.js";
import { createSpaRoutes } from "./spa/spa.routes.js";

// Pure HTTP assembly: middleware, the OpenAPI routes (dev only — not
// publicly visible in prod), the already-wired api router, the SPA (when
// configured), and the error handler. Wiring lives in routes/index.ts; the
// two are combined by createBackend (backend.ts).
export function createApp(apiRouter: Router) {
  const app = express();

  // No CORS middleware: every path is same-origin — the Vite proxy in dev,
  // the backend-served SPA (SPA_DIR) in prod.
  app.use(express.json());
  app.use(cookieParser());
  if (env.DEBUG) {
    app.use(createOpenApiRoutes());
  }
  app.use("/api", apiRouter);
  app.use("/api", apiNotFound);
  if (env.SPA_DIR !== undefined) {
    app.use(createSpaRoutes(env.SPA_DIR));
  }
  app.use(errorHandler);

  app.set("trust proxy", env.DEBUG ? false : 1);

  return app;
}
