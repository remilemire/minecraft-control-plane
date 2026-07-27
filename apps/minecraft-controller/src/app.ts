// apps/minecraft-controller/src/app.ts

import express, { type ErrorRequestHandler, type Router } from "express";
import { ContainerNotFoundError } from "./docker.js";
import { createRequireBearerToken } from "./routes.js";

// This service is internal — it speaks plain `{ message }` errors, not the
// panel's `{ kind, code, message }` shape; the backend never surfaces these
// bodies to users.
// Express only treats a middleware as an error handler when it declares
// exactly four parameters, so `_next` must stay even though it is unused.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- see above
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);

  const message =
    error instanceof ContainerNotFoundError ? error.message : "Internal server error.";
  res.status(500).json({ message });
};

export interface CreateAppOptions {
  readonly router: Router;
  readonly token: string;
}

// Pure HTTP assembly: the auth gate, the wired routes, then the terminal error
// handler. Wiring lives in server.ts. No express.json() — no route takes a body.
export function createApp({ router, token }: CreateAppOptions) {
  const app = express();

  app.use(createRequireBearerToken(token));
  app.use(router);
  app.use(errorHandler);

  return app;
}
