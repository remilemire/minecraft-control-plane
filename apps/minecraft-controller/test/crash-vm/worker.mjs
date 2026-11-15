// Test-only worker. The production entrypoint never imports this file.
import { createServer } from "node:http";
import process from "node:process";
import console from "node:console";
import { readFile } from "node:fs/promises";
import Dockerode from "dockerode";
import { DockerClient } from "./dist/docker.js";
import { DockerBackupRuntime } from "./dist/backups/runtime.js";
import { BackupManager } from "./dist/backups/manager.js";
import { StartupGate } from "./dist/maintenance/startup-gate.js";
import { createApp } from "./dist/app.js";
import { createRoutes } from "./dist/routes.js";
const token = process.env.DRILL_TOKEN;
const docker = new Dockerode({ socketPath: "/docker-host-run/docker.sock" });
const client = new DockerClient({ docker, projectName: "crash-drill", serviceName: "minecraft" });
const runtime = new DockerBackupRuntime(client, docker);
const gate = new StartupGate("/server-data/startup-gate", client);
let armed = process.env.DRILL_BARRIER ? JSON.parse(process.env.DRILL_BARRIER) : null;
let reached = null;
let releaseBarrier;
let initialized = false;
const control = createServer(async (req, res) => {
  try {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end();
      return;
    }
    let input = "";
    for await (const chunk of req) input += chunk;
    if (req.method === "POST") {
      const command = JSON.parse(input);
      if (command.release) {
        armed = null;
        releaseBarrier?.();
      } else {
        armed = command;
        reached = null;
      }
    }
    let state = null;
    try {
      state = JSON.parse(await readFile("/server-data/backup-state/state.json"));
    } catch {
      /* The journal does not exist before fresh initialization. */
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ armed, reached, initialized, state }));
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});
control.listen(8999);
await gate.initialize();
const manager = new BackupManager({
  dataRoot: "/server-data",
  timezone: "UTC",
  retention: { hourly: 6, daily: 5, weekly: 3, monthly: 2 },
  runtime,
  startupGate: gate,
  countdown: async () => {},
  observer: async (operation, event) => {
    if (
      armed &&
      Object.entries(armed).every(
        ([key, value]) => (key === "event" ? event : operation[key]) === value,
      )
    ) {
      reached = { ...operation, event };
      console.log("BARRIER", JSON.stringify(reached));
      await new Promise((resolve) => {
        releaseBarrier = resolve;
      });
    }
  },
});
await manager.initialize();
manager.startScheduler();
createApp({ token, router: createRoutes({ docker: client, backups: manager }) }).listen(
  8000,
  () => {
    initialized = true;
    console.log("TEST CONTROLLER READY");
  },
);
