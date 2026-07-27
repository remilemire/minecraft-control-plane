// apps/minecraft-controller/src/server.ts

import Dockerode from "dockerode";
import { createApp } from "./app.js";
import { env } from "./config.js";
import { DockerClient } from "./docker.js";
import { createRoutes } from "./routes.js";

const dockerClient = new DockerClient({
  docker: new Dockerode({ socketPath: env.DOCKER_SOCKET }),
  projectName: env.MINECRAFT_COMPOSE_PROJECT,
  serviceName: env.MINECRAFT_COMPOSE_SERVICE,
});

const app = createApp({
  router: createRoutes({ docker: dockerClient }),
  token: env.MINECRAFT_CONTROLLER_TOKEN,
});

const server = app.listen(env.MINECRAFT_CONTROLLER_PORT, () => {
  console.log(`Minecraft controller listening on port ${env.MINECRAFT_CONTROLLER_PORT}`);
});

let shuttingDown = false;

function shutdown(): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  server.close(() => {
    process.exit(0);
  });
  // close() only refuses new connections; drop idle keep-alives so it
  // actually settles.
  server.closeIdleConnections();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
