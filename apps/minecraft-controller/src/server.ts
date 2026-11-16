// apps/minecraft-controller/src/server.ts

import Dockerode from "dockerode";
import { createApp } from "@/http/app.js";
import { env } from "./config.js";
import { DockerClient } from "@/runtime/docker-client.js";
import { createRoutes } from "@/http/routes.js";
import { createController } from "./composition.js";
import { DockerMinecraftRuntime } from "@/runtime/minecraft-runtime.js";
import { StartupGate } from "@/maintenance/startup-gate.js";
import { join } from "node:path";

const docker = new Dockerode({ socketPath: env.DOCKER_SOCKET });
const dockerClient = new DockerClient({
  docker,
  projectName: env.MINECRAFT_COMPOSE_PROJECT,
  serviceName: env.MINECRAFT_COMPOSE_SERVICE,
});

const runtime = new DockerMinecraftRuntime(dockerClient, docker);
const startupGate = new StartupGate(join(env.MINECRAFT_DATA_ROOT, "startup-gate"), runtime);
await startupGate.initialize();
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
  startupGate,
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

  server.close(() => {
    void controller
      .close()
      .then(() => startupGate.close())
      .then(() => process.exit(0));
  });
  // close() only refuses new connections; drop idle keep-alives so it
  // actually settles.
  server.closeIdleConnections();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
