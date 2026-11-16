import { Router } from "express";
import { once } from "node:events";
import {
  minecraftConsoleLogEventSchema,
  minecraftServerStatusResponseSchema,
  controllerRconRequestSchema,
  controllerRconResponseSchema,
} from "@minecraft-control-plane/shared/minecraft";
import type { ServerApi } from "./service.js";
export function createServerRoutes(server: ServerApi): Router {
  const router = Router();
  router.post("/start", async (_req, res) => {
    await server.power("start");
    res.status(204).end();
  });

  router.post("/stop", async (_req, res) => {
    await server.power("stop");
    res.status(204).end();
  });

  router.post("/restart", async (_req, res) => {
    await server.power("restart");
    res.status(204).end();
  });

  router.get("/status", async (_req, res) => {
    res.json(minecraftServerStatusResponseSchema.parse(await server.getStatus()));
  });

  router.post("/rcon", async (req, res) => {
    const { command } = controllerRconRequestSchema.parse(req.body);
    res.json(controllerRconResponseSchema.parse({ output: await server.execute(command) }));
  });

  router.get("/logs", async (_req, res) => {
    const abortController = new AbortController();
    const abort = () => {
      abortController.abort();
    };
    res.once("close", abort);

    try {
      const events = await server.openLogStream(abortController.signal);

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
