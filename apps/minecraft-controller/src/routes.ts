// apps/minecraft-controller/src/routes.ts

import {
  minecraftConsoleLogEventSchema,
  minecraftServerStatusResponseSchema,
  controllerRconRequestSchema,
  controllerRconResponseSchema,
} from "@minecraft-control-plane/shared/minecraft";
import { Router, type RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import type { MinecraftDockerApi } from "./docker.js";
import type { BackupManager } from "./backups/manager.js";
import { createBackupRoutes } from "./backups/routes.js";

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
  readonly backups: BackupManager;
}

// Express 5 forwards rejected async handlers to the error middleware natively,
// so failures land in the app's terminal error handler without wrappers.
export function createRoutes({ docker, backups }: CreateRoutesOptions): Router {
  const router = Router();

  router.post("/start", async (_req, res) => {
    await backups.power("start");
    res.status(204).end();
  });

  router.post("/stop", async (_req, res) => {
    await backups.power("stop");
    res.status(204).end();
  });

  router.post("/restart", async (_req, res) => {
    await backups.power("restart");
    res.status(204).end();
  });

  router.get("/status", async (_req, res) => {
    const status = await docker.getStatus();
    res.json(
      minecraftServerStatusResponseSchema.parse({ status, maintenance: backups.activeOperation() }),
    );
  });

  router.use("/backups", createBackupRoutes(backups));
  router.post("/rcon", async (req, res) => {
    const { command } = controllerRconRequestSchema.parse(req.body);
    res.json(controllerRconResponseSchema.parse({ output: await backups.execute(command) }));
  });

  router.get("/logs", async (_req, res) => {
    const abortController = new AbortController();
    const abort = () => {
      abortController.abort();
    };
    res.once("close", abort);

    try {
      const events = await docker.openLogStream(abortController.signal);

      res.status(200).set({
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "application/x-ndjson",
      });
      res.flushHeaders();

      for await (const event of events) {
        const data = minecraftConsoleLogEventSchema.parse(event);

        if (!res.write(`${JSON.stringify(data)}\n`) && !abortController.signal.aborted) {
          await once(res, "drain", { signal: abortController.signal });
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      if (!res.headersSent) {
        throw error;
      }
      console.error(error);
      res.destroy(error instanceof Error ? error : undefined);
    } finally {
      res.off("close", abort);
      if (res.headersSent && !res.destroyed && !res.writableEnded) {
        res.end();
      }
    }
  });

  return router;
}
