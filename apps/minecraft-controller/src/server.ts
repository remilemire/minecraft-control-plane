// apps/minecraft-controller/src/server.ts

import Dockerode from "dockerode";
import { createApp } from "@/http/app.js";
import { env } from "./config.js";
import { DockerClient } from "@/runtime/docker-client.js";
import { createRoutes } from "@/http/routes.js";
import { createController } from "./composition.js";
import { DockerMinecraftRuntime } from "@/runtime/minecraft-runtime.js";

const docker = new Dockerode({ socketPath: env.DOCKER_SOCKET });
const dockerClient = new DockerClient({
  docker,
  projectName: env.MINECRAFT_COMPOSE_PROJECT,
  serviceName: env.MINECRAFT_COMPOSE_SERVICE,
});

const runtime = new DockerMinecraftRuntime(dockerClient, docker);
const controller = createController({
  dataRoot: env.MINECRAFT_DATA_ROOT,
  timezone: env.MINECRAFT_BACKUP_TIMEZONE,
  retention: {
    hourly: env.MINECRAFT_BACKUP_KEEP_HOURLY,
    daily: env.MINECRAFT_BACKUP_KEEP_DAILY,
    weekly: env.MINECRAFT_BACKUP_KEEP_WEEKLY,
    monthly: env.MINECRAFT_BACKUP_KEEP_MONTHLY,
  },
  runtime,
});
await controller.initialize();
controller.start();

const app = createApp({
  router: createRoutes(controller),
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
  controller.server.closeLogStreams();

  const closing = controller.close();
  server.close(() => {
    void closing
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error("Controller shutdown failed", error);
        process.exit(1);
      });
  });
  // close() only refuses new connections; drop idle keep-alives so it
  // actually settles.
  server.closeIdleConnections();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
