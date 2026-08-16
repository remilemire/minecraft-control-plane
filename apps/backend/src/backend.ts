// apps/backend/src/backend.ts

// The composition entry point: wires the dependency graph (createRouter) and
// assembles the HTTP pipeline around it (createApp). Consumers own the
// returned pieces' lifecycles — server.ts starts the dispatcher's poll loop,
// tests drive tick() deterministically and never start it.
import { createApp } from "./app.js";
import { createRouter, type AppDeps } from "./routes/index.js";
import type { OutboxDispatcher } from "@/infrastructure/outbox/index.js";

export interface Backend {
  readonly app: ReturnType<typeof createApp>;
  readonly outboxDispatcher: OutboxDispatcher;
  closeConsoleStreams(): void;
}

export function createBackend(deps: AppDeps): Backend {
  const { router, outboxDispatcher, closeConsoleStreams } = createRouter(deps);

  return { app: createApp(router), outboxDispatcher, closeConsoleStreams };
}
