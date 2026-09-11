// apps/minecraft-controller/src/app.ts

import express, { type ErrorRequestHandler, type Express, type Router } from "express";
import { ContainerNotFoundError } from "./docker.js";
import { createRequireBearerToken } from "./routes.js";
import { BackupError } from "./backups/errors.js";
import { minecraftBackupErrorMeta } from "@minecraft-control-plane/shared/minecraft";
import { ZodError } from "zod";

// Typed maintenance errors carry shared codes. The backend maps those codes
// through its public error catalogue; other internal failures remain generic.
// Express only treats a middleware as an error handler when it declares
// exactly four parameters, so `_next` must stay even though it is unused.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- see above
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof BackupError) {
    const kind = minecraftBackupErrorMeta[error.code].kind;
    const status = { CONFLICT: 409, NOT_FOUND: 404, VALIDATION: 400, SERVICE_UNAVAILABLE: 503 }[
      kind
    ];
    res.status(status).json({ code: error.code, message: error.message });
    return;
  }
  if (error instanceof ZodError || (error instanceof SyntaxError && "body" in error)) {
    res.status(400).json({ code: "BACKUP_INVALID", message: "Invalid controller request." });
    return;
  }
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
// handler. Wiring lives in server.ts. Parse bounded JSON only after authentication.
// The explicit return type keeps the declaration emit portable (TS2883 under a
// clean build, where the inferred type must reference express internals).
export function createApp({ router, token }: CreateAppOptions): Express {
  const app = express();

  app.use(createRequireBearerToken(token));
  app.use(express.json({ limit: "16kb" }));
  app.use(router);
  app.use(errorHandler);

  return app;
}
