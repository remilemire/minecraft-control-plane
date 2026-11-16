import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { Socket } from "node:net";
import { once } from "node:events";
import Dockerode from "dockerode";
import { afterEach } from "vitest";
import { DockerClient } from "@/runtime/docker-client.js";
import { DockerMinecraftRuntime } from "@/runtime/minecraft-runtime.js";
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export interface ExecPlan {
  frames?: { stream: 1 | 2; data: Buffer | string }[];
  exitCode?: number | null;
  hold?: ReturnType<typeof deferred>;
}
export function dockerFrame(stream: 1 | 2, data: Buffer | string): Buffer {
  const payload = Buffer.from(data),
    header = Buffer.alloc(8);
  header[0] = stream;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}
export class DockerDaemon {
  public readonly requests: {
    method: string;
    path: string;
    query: URLSearchParams;
    body: unknown;
  }[] = [];
  public readonly plans: ExecPlan[] = [];
  public readonly started: string[] = [];
  public readonly stopEntered = deferred();
  public stopHold: ReturnType<typeof deferred> | null = null;
  public listHold: ReturnType<typeof deferred> | null = null;
  public logHold: ReturnType<typeof deferred> | null = null;
  public readonly listEntered = deferred();
  public readonly logOpened = deferred();
  public closedLogReads = 0;
  public missing = false;
  public multiple = false;
  public running = true;
  public paused = false;
  public oom = false;
  public exitCode = 0;
  public startStatus = 204;
  private readonly execs = new Map<string, ExecPlan>();
  private readonly sockets = new Set<Socket>();
  private readonly server = createServer((req, res) => {
    void this.handle(req, res).catch((error) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ message: String(error) }));
    });
  });
  public constructor() {
    this.server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
      socket.on("error", () => {});
    });
    this.server.on("upgrade", (req, socket) => {
      void this.upgrade(req, socket).catch(() => socket.destroy());
    });
  }
  public async listen(): Promise<number> {
    this.server.listen(0, "127.0.0.1");
    await once(this.server, "listening");
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("No test transport address");
    return address.port;
  }
  private inspect() {
    return {
      Id: "managed-container",
      Config: { Hostname: "test-minecraft", Env: ["TYPE=VANILLA", "VERSION=1.21.1"] },
      HostConfig: { RestartPolicy: { Name: "unless-stopped" } },
      State: {
        Running: this.running,
        Paused: this.paused,
        Restarting: false,
        Dead: false,
        OOMKilled: this.oom,
        ExitCode: this.exitCode,
      },
    };
  }
  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost"),
      path = url.pathname.replace(/^\/v[0-9.]+/, "");
    let data = "";
    for await (const chunk of req) data += String(chunk);
    const body: unknown = data ? JSON.parse(data) : null;
    this.requests.push({ method: req.method ?? "GET", path, query: url.searchParams, body });
    res.setHeader("content-type", "application/json");
    if (path === "/containers/json") {
      this.listEntered.resolve();
      if (this.listHold) await this.listHold.promise;
      const container = { Id: "managed-container", State: this.running ? "running" : "exited" };
      res.end(
        JSON.stringify(
          this.missing
            ? []
            : this.multiple
              ? [container, { ...container, Id: "other" }]
              : [container],
        ),
      );
    } else if (path === "/containers/managed-container/json")
      res.end(JSON.stringify(this.inspect()));
    else if (path === "/containers/managed-container/exec") {
      const id = "exec-" + String(this.execs.size + 1);
      this.execs.set(
        id,
        this.plans.shift() ?? {
          frames: [{ stream: 1, data: "There are 0 of a max of 20 players online:" }],
        },
      );
      res.statusCode = 201;
      res.end(JSON.stringify({ Id: id }));
    } else if (/^\/exec\/[^/]+\/json$/.test(path)) {
      const id = path.split("/")[2]!,
        plan = this.execs.get(id);
      res.end(
        JSON.stringify({
          Running: false,
          ExitCode: plan?.exitCode === undefined ? 0 : plan.exitCode,
        }),
      );
    } else if (path === "/containers/managed-container/start") {
      res.statusCode = this.startStatus;
      if (this.startStatus === 204) this.running = true;
      res.end(
        this.startStatus >= 400 ? JSON.stringify({ message: "Docker start failed" }) : undefined,
      );
    } else if (path === "/containers/managed-container/stop") {
      this.stopEntered.resolve();
      if (this.stopHold) await this.stopHold.promise;
      this.running = false;
      res.statusCode = 204;
      res.end();
    } else if (path === "/containers/managed-container/update")
      res.end(JSON.stringify({ Warnings: [] }));
    else if (path === "/containers/managed-container/logs") {
      res.setHeader("content-type", "application/vnd.docker.raw-stream");
      res.once("close", () => {
        this.closedLogReads++;
      });
      res.write(Buffer.concat([dockerFrame(1, "line one\n"), dockerFrame(2, "line two\n")]));
      res.flushHeaders();
      this.logOpened.resolve();
      if (this.logHold) await this.logHold.promise;
      res.end();
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: "Unexpected test Docker endpoint: " + path }));
    }
  }
  private async upgrade(req: IncomingMessage, socket: Duplex) {
    const path = new URL(req.url ?? "/", "http://localhost").pathname.replace(/^\/v[0-9.]+/, ""),
      id = path.split("/")[2]!,
      plan = this.execs.get(id);
    if (!plan) throw new Error("Unknown exec");
    this.started.push(id);
    socket.write("HTTP/1.1 101 UPGRADED\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n");
    if (plan.hold) await plan.hold.promise;
    for (const frame of plan.frames ?? [])
      if (!socket.destroyed) socket.write(dockerFrame(frame.stream, frame.data));
    socket.end();
  }
  public async close() {
    this.listHold?.resolve();
    this.logHold?.resolve();
    this.stopHold?.resolve();
    for (const plan of this.execs.values()) plan.hold?.resolve();
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
const daemons: DockerDaemon[] = [];
afterEach(async () => {
  await Promise.all(daemons.splice(0).map((daemon) => daemon.close()));
});
export async function dockerFixture() {
  const daemon = new DockerDaemon();
  daemons.push(daemon);
  const port = await daemon.listen();
  const docker = new Dockerode({ host: "127.0.0.1", port, protocol: "http" });
  const client = new DockerClient({
    docker,
    projectName: "test-project",
    serviceName: "minecraft",
  });
  return { daemon, docker, client, runtime: new DockerMinecraftRuntime(client, docker) };
}
