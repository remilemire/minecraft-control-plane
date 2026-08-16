// apps/backend/src/features/minecraft/server/console/console.controller.ts

import { parseOrThrow } from "@/validation/parse.js";
import {
  minecraftConsoleCommandSchema,
  minecraftConsoleLogEventSchema,
} from "@minecraft-control-plane/shared/minecraft";
import type { Request, Response } from "express";
import { once } from "node:events";
import type { MinecraftConsoleService } from "./console.service.js";

export class MinecraftConsoleController {
  private readonly activeStreams = new Set<AbortController>();

  public constructor(private readonly minecraftConsoleService: MinecraftConsoleService) {}

  public closeStreams(): void {
    for (const stream of this.activeStreams) {
      stream.abort();
    }
    this.activeStreams.clear();
  }

  public executeCommand = async (req: Request, res: Response): Promise<void> => {
    const { command } = parseOrThrow(minecraftConsoleCommandSchema, req.body);

    await this.minecraftConsoleService.execute(command);

    res.status(204).send();
  };

  public streamLogs = async (_req: Request, res: Response): Promise<void> => {
    const abortController = new AbortController();
    const abort = () => {
      abortController.abort();
    };
    this.activeStreams.add(abortController);
    res.once("close", abort);

    try {
      // Open the internal controller stream before committing the browser
      // response, so setup failures still use the normal JSON error contract.
      const events = await this.minecraftConsoleService.openLogStream(abortController.signal);

      res.status(200).set({
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });
      res.flushHeaders();

      for await (const event of events) {
        const data = minecraftConsoleLogEventSchema.parse(event);
        const frame = `event: log\ndata: ${JSON.stringify(data)}\n\n`;

        if (!res.write(frame) && !abortController.signal.aborted) {
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
      this.activeStreams.delete(abortController);
      res.off("close", abort);
      if (!res.destroyed && !res.writableEnded) {
        res.end();
      }
    }
  };
}
