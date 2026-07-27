// apps/backend/src/server.ts

import { createBackend } from "./backend.js";
import { env } from "./config/env.js";
import { db, pool } from "@/infrastructure/db/index.js";
import { GoogleOauthClient } from "./features/auth/clients/google-oauth.client.js";
import { MojangClient } from "./features/minecraft/clients/mojang.client.js";
import { ProcessClient } from "./features/minecraft/clients/process.client.js";
import { RconClient } from "./features/minecraft/clients/rcon.client.js";

const port = Number(env.BACKEND_PORT);

const { app, outboxDispatcher } = createBackend({
  db,
  googleOauthClient: new GoogleOauthClient({ clientId: env.GOOGLE_CLIENT_ID }),
  mojangClient: new MojangClient(),
  rconClient: new RconClient({
    host: env.MINECRAFT_RCON_HOST,
    port: env.MINECRAFT_RCON_PORT,
    password: env.MINECRAFT_RCON_PASSWORD,
  }),
  processClient: new ProcessClient({
    composeFile: env.MINECRAFT_COMPOSE_FILE,
    serviceName: env.MINECRAFT_CONTAINER,
  }),
});

outboxDispatcher.start();

const server = app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Graceful shutdown: stop accepting requests (which enqueue messages), let
// the in-flight dispatcher tick finish, then release the pool. Unfinished
// outbox messages are simply picked up on the next boot.
let shuttingDown = false;

function shutdown(): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  void (async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
      // close() only refuses new connections; drop idle keep-alives so it
      // actually settles.
      server.closeIdleConnections();
    });
    await outboxDispatcher.stop();
    await pool.end();
    process.exit(0);
  })();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
