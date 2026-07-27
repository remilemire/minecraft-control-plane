// apps/minecraft-controller/src/routes.ts

import { minecraftServerStatusResponseSchema } from "@minecraft-server/shared/minecraft";
import { Router, type RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";
import type { MinecraftDockerApi } from "./docker.js";

export function createRequireBearerToken(token: string): RequestHandler {
  const expected = Buffer.from(`Bearer ${token}`);

  return (req, res, next) => {
    const provided = Buffer.from(req.get("authorization") ?? "");

    // timingSafeEqual demands equal lengths; a length mismatch is already a
    // rejection, and comparing against `expected` twice keeps the timing flat.
    const matches = provided.length === expected.length && timingSafeEqual(provided, expected);

    if (!matches) {
      res.status(401).json({ message: "Unauthorized." });
      return;
    }
    next();
  };
}

export interface CreateRoutesOptions {
  readonly docker: MinecraftDockerApi;
}

// Express 5 forwards rejected async handlers to the error middleware natively,
// so failures land in the app's terminal error handler without wrappers.
export function createRoutes({ docker }: CreateRoutesOptions): Router {
  const router = Router();

  router.post("/start", async (_req, res) => {
    await docker.start();
    res.status(204).end();
  });

  router.post("/stop", async (_req, res) => {
    await docker.stop();
    res.status(204).end();
  });

  router.post("/restart", async (_req, res) => {
    await docker.restart();
    res.status(204).end();
  });

  router.get("/status", async (_req, res) => {
    const status = await docker.getStatus();
    res.json(minecraftServerStatusResponseSchema.parse({ status }));
  });

  return router;
}
