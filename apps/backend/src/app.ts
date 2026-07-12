// apps/backend/src/app.ts

// Must stay the first import: zod v4 copies base methods onto schemas at
// construction, so .openapi() has to exist before any schema module (notably
// @minecraft-server/shared via the controllers) is evaluated.
import "./openapi/zod-extend.js";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { createRouter, type AppDeps } from "./routes/index.js";

import { errorHandler } from "./middleware/error-handler.js";
import { env } from "./config/env.js";
import { createOpenApiRoutes } from "./openapi/openapi.routes.js";

export function createApp(deps: AppDeps) {
  const app = express();

  app.use(cors({ origin: env.ALLOWED_ORIGINS, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(createOpenApiRoutes());
  app.use("/api", createRouter(deps));
  app.use(errorHandler);

  app.set("trust proxy", env.DEBUG ? false : 1);

  return app;
}
