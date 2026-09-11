// apps/minecraft-controller/src/server.ts

import Dockerode from "dockerode";
import { createApp } from "./app.js";
import { env } from "./config.js";
import { DockerClient } from "./docker.js";
import { createRoutes } from "./routes.js";
import { BackupManager } from "./backups/manager.js";
import { DockerBackupRuntime } from "./backups/runtime.js";

const docker = new Dockerode({ socketPath: env.DOCKER_SOCKET });
const dockerClient = new DockerClient({
  docker,
  projectName: env.MINECRAFT_COMPOSE_PROJECT,
  serviceName: env.MINECRAFT_COMPOSE_SERVICE,
});

const backups = new BackupManager({
  dataRoot: env.MINECRAFT_DATA_ROOT,
  timezone: env.MINECRAFT_BACKUP_TIMEZONE,
  retention: {
    hourly: env.MINECRAFT_BACKUP_KEEP_HOURLY,
    daily: env.MINECRAFT_BACKUP_KEEP_DAILY,
    weekly: env.MINECRAFT_BACKUP_KEEP_WEEKLY,
    monthly: env.MINECRAFT_BACKUP_KEEP_MONTHLY,
  },
  runtime: new DockerBackupRuntime(dockerClient, docker),
});
await backups.initialize();
backups.startScheduler();

const app = createApp({
  router: createRoutes({ docker: dockerClient, backups }),
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
  dockerClient.closeLogStreams();

  server.close(() => {
    void backups.close().then(() => process.exit(0));
  });
  // close() only refuses new connections; drop idle keep-alives so it
  // actually settles.
  server.closeIdleConnections();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
