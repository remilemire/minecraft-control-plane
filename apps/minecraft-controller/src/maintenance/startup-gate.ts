import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { DockerClient } from "@/docker.js";
import { atomicText, syncDirectory } from "./atomic-files.js";

export interface StartupAuthorization {
  block(): Promise<void>;
  open(): Promise<void>;
  boot<T>(containerId: string, action: () => Promise<T>): Promise<T>;
}

// Fresh per-boot challenges prevent persisted permissions from authorizing a
// different process after a host/daemon crash. Minecraft cannot write permits.
export class StartupGate implements StartupAuthorization {
  private idle = false;
  private target: string | null = null;
  private pending: Promise<void> = Promise.resolve();
  private timer: NodeJS.Timeout | undefined;
  private closed = false;
  private lastGrant: string | null = null;
  public constructor(
    private readonly root: string,
    private readonly client: DockerClient,
  ) {}

  public async initialize(): Promise<void> {
    await mkdir(join(this.root, "requests"), { recursive: true, mode: 0o755 });
    await mkdir(join(this.root, "permits"), { recursive: true, mode: 0o755 });
    await this.block();
    const tick = async () => {
      if (this.closed) return;
      this.pending = this.process().catch((error: unknown) => {
        console.error(
          "Minecraft startup authorization unavailable",
          error instanceof Error ? error.message : error,
        );
      });
      await this.pending;
      if (!this.closed)
        this.timer = setTimeout(() => {
          void tick();
        }, 200).unref();
    };
    this.timer = setTimeout(() => {
      void tick();
    }, 0).unref();
  }

  public async block(): Promise<void> {
    this.idle = false;
    await this.pending;
    this.lastGrant = null;
    await rm(join(this.root, "permits/current"), { force: true });
    await syncDirectory(join(this.root, "permits"));
  }
  public async open(): Promise<void> {
    this.idle = true;
  }
  public async boot<T>(containerId: string, action: () => Promise<T>): Promise<T> {
    if (this.target) throw new Error("A startup authorization is already active.");
    this.target = containerId;
    try {
      return await action();
    } finally {
      this.target = null;
      await this.block();
    }
  }
  public async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    await this.block();
  }
  private async process(): Promise<void> {
    if (!this.idle && !this.target) return;
    let request: string;
    try {
      request = await readFile(join(this.root, "requests/current"), "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    if (request.length > 160 || !/^[a-zA-Z0-9_.-]{1,64}\n[0-9a-f-]{36}\n$/.test(request)) return;
    const [hostname] = request.split("\n");
    let container;
    try {
      container = await (await this.client.getManagedContainer()).inspect();
    } catch {
      return;
    } // Missing containers/daemon outages never grant startup.
    if (!container.State.Running || container.Config.Hostname !== hostname) return;
    if (!this.idle && this.target !== container.Id) return;
    if (this.closed || (!this.idle && !this.target) || request === this.lastGrant) return;
    await atomicText(join(this.root, "permits/current"), request);
    this.lastGrant = request;
  }
}
