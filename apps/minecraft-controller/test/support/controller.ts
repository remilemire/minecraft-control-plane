import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, vi } from "vitest";
import type {
  MinecraftRuntime,
  MinecraftReader,
  RuntimeState,
  RestartPolicy,
} from "@/runtime/service.js";
import type { Clock } from "@/time.js";
import { createController, type ControllerApplication } from "@/composition.js";
import { createApp } from "@/http/app.js";
import { createRoutes } from "@/http/routes.js";

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
export class TestClock implements Clock {
  public date = new Date("2026-09-10T18:30:00Z");
  public readonly sleeps: number[] = [];
  public now(): Date {
    return new Date(this.date);
  }
  public async sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds);
    this.date = new Date(this.date.getTime() + milliseconds);
  }
}
/** Simulates the external container/entrypoint, never controller business logic. */
export class TestMinecraft implements MinecraftRuntime, MinecraftReader {
  public state: RuntimeState = {
    containerId: "managed-container",
    hostname: "test-minecraft",
    running: true,
    env: { TYPE: "FTBA", LEVEL: "world", FTB_MODPACK_ID: "130", FTB_MODPACK_VERSION_ID: "100440" },
    restartPolicy: { Name: "unless-stopped" },
  };
  public javaRunning = true;
  public playerCount = 0;
  public savingEnabled = true;
  public readonly calls: string[] = [];
  public readonly commands: string[] = [];
  public upstreamStarts = 0;
  public readinessFailures = 0;
  public commandFailure: string | null = null;
  public stopFailure: Error | null = null;
  private boot: Promise<boolean> = Promise.resolve(true);
  private generation = 0;
  private readyHold: ReturnType<typeof deferred> | null = null;
  private stopHold: ReturnType<typeof deferred> | null = null;
  public constructor(private readonly root: string) {}
  public holdReady() {
    this.readyHold = deferred();
    return this.readyHold;
  }
  public holdStop() {
    this.stopHold = deferred();
    return this.stopHold;
  }
  public releaseAll(): void {
    this.readyHold?.resolve(undefined);
    this.stopHold?.resolve(undefined);
  }
  public async inspect(): Promise<RuntimeState> {
    return structuredClone(this.state);
  }
  public async getStatus() {
    return this.state.running ? ("RUNNING" as const) : ("STOPPED" as const);
  }
  public async openLogStream() {
    return (async function* () {
      yield { stream: "stdout" as const, line: "Minecraft test log" };
    })();
  }
  public closeLogStreams(): void {}
  public async start(): Promise<void> {
    this.calls.push("start");
    if (this.state.running) return;
    this.state.running = true;
    this.javaRunning = false;
    const generation = ++this.generation;
    const request = `${this.state.hostname}\n${randomUUID()}\n`;
    await writeFile(join(this.root, "startup-gate/requests/current"), request);
    this.boot = (async () => {
      while (this.state.running && this.generation === generation) {
        try {
          if (
            (await readFile(join(this.root, "startup-gate/permits/current"), "utf8")) === request
          ) {
            this.javaRunning = true;
            this.upstreamStarts++;
            return true;
          }
        } catch {
          /* no authorization yet */
        }
        await delay(5);
      }
      return false;
    })();
  }
  public async stop(): Promise<void> {
    this.calls.push("stop");
    if (this.stopFailure) throw this.stopFailure;
    this.state.running = false;
    this.javaRunning = false;
    this.generation++;
    if (this.stopHold) {
      await this.stopHold.promise;
      this.stopHold = null;
    }
  }
  public async setRestartPolicy(policy: RestartPolicy) {
    this.calls.push(`policy:${policy.Name}`);
    this.state.restartPolicy = structuredClone(policy);
  }
  public async waitReady(): Promise<void> {
    this.calls.push("ready");
    const deadline = Date.now() + 2000;
    while (this.state.running && !this.javaRunning && Date.now() < deadline) await delay(5);
    if (!this.javaRunning)
      throw new Error("RCON readiness timed out while Minecraft waited for authorization");
    if (this.readyHold) {
      await this.readyHold.promise;
      this.readyHold = null;
    }
    if (this.readinessFailures-- > 0) throw new Error("Minecraft failed readiness");
    if (!this.state.running || !this.javaRunning) throw new Error("Minecraft is not ready");
  }
  public async execute(command: string): Promise<string> {
    this.commands.push(command);
    if (!this.state.running || !this.javaRunning || this.commandFailure === command)
      throw new Error("RCON unavailable");
    if (command === "list") return `There are ${this.playerCount} of a max of 20 players online:`;
    return "Done";
  }
  public async players() {
    await this.execute("list");
    return this.playerCount;
  }
  public async saving(enabled: boolean) {
    await this.execute(enabled ? "save-on" : "save-off");
    this.savingEnabled = enabled;
  }
  public async flush() {
    await this.execute("save-all flush");
  }
  public async announce(message: string) {
    await this.execute(`say ${message}`);
  }
}
const fixtures: { root: string; runtime: TestMinecraft; controller: ControllerApplication }[] = [];
afterEach(async () => {
  const items = fixtures.splice(0);
  for (const item of items) item.runtime.releaseAll();
  await Promise.all(items.map((item) => item.controller.close()));
  await Promise.all(items.map((item) => item.runtime.stop()));
  await Promise.all(
    [...new Set(items.map((item) => item.root))].map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});
export async function fixture(
  options: { running?: boolean; root?: string; clock?: TestClock } = {},
) {
  const root = options.root ?? (await mkdtemp(join(tmpdir(), "controller-rebuild-")));
  const data = join(root, "minecraft");
  await mkdir(join(data, "world"), { recursive: true });
  await mkdir(join(data, "mods"), { recursive: true });
  await writeFile(join(data, "world/level.dat"), "original world");
  await writeFile(join(data, "mods/test.jar"), "original mod");
  await writeFile(
    join(data, "server.properties"),
    "level-name=world\nrcon.password=current-secret\nwhite-list=true\n",
  );
  await writeFile(join(data, "whitelist.json"), "current whitelist");
  await writeFile(join(data, ".ftb-installed"), "130=100440\n");
  await writeFile(
    join(data, ".manifest.json"),
    JSON.stringify({
      id: 130,
      versionId: 100440,
      modPackTargets: { mcVersion: "1.21.1", modLoader: { name: "neoforge", version: "21.1.243" } },
    }),
  );
  const runtime = new TestMinecraft(root),
    clock = options.clock ?? new TestClock();
  if (options.running === false) {
    runtime.state.running = false;
    runtime.javaRunning = false;
  }
  const controller = createController({
    dataRoot: root,
    runtime,
    clock,
    timezone: "America/Edmonton",
    retention: { hourly: 6, daily: 5, weekly: 3, monthly: 2 },
  });
  fixtures.push({ root, runtime, controller });
  await controller.initialize();
  const app = createApp({ token: "test-token", router: createRoutes(controller) });
  return { root, data, runtime, clock, controller, app };
}
export async function reopen(f: {
  root: string;
  runtime: TestMinecraft;
  clock: TestClock;
  controller: ControllerApplication;
}) {
  await f.controller.close();
  const controller = createController({
    dataRoot: f.root,
    runtime: f.runtime,
    clock: f.clock,
    timezone: "America/Edmonton",
    retention: { hourly: 6, daily: 5, weekly: 3, monthly: 2 },
  });
  fixtures.push({ root: f.root, runtime: f.runtime, controller });
  await controller.initialize();
  return { controller, app: createApp({ token: "test-token", router: createRoutes(controller) }) };
}
export const authorization = "Bearer test-token";

export async function finish(controller: ControllerApplication, id: string) {
  await vi.waitFor(
    () => {
      if (controller.maintenance.operation(id).status === "running")
        throw new Error("Operation is running");
    },
    { timeout: 10000, interval: 10 },
  );
  return controller.maintenance.operation(id);
}
export async function backup(controller: ControllerApplication) {
  const op = await finish(controller, await controller.backups.create(randomUUID()));
  if (op.status !== "succeeded" || !op.backupId) throw new Error(JSON.stringify(op));
  return op.backupId;
}
