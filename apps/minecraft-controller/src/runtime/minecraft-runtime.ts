import type Dockerode from "dockerode";
import { setTimeout as delay } from "node:timers/promises";
import { ControllerError } from "@/errors.js";
import type { DockerClient } from "./docker-client.js";
import type {
  MinecraftRuntime,
  RuntimeState,
  RestartPolicy,
  MinecraftReader,
} from "./contracts.js";
import { DockerRcon, parseOnlinePlayerCount } from "./rcon.js";
export class DockerMinecraftRuntime implements MinecraftRuntime, MinecraftReader {
  private readonly rcon: DockerRcon;
  public constructor(
    private readonly client: DockerClient,
    docker: Dockerode,
  ) {
    this.rcon = new DockerRcon(client, docker);
  }
  public getStatus() {
    return this.client.getStatus();
  }
  public openLogStream(signal: AbortSignal) {
    return this.client.openLogStream(signal);
  }
  public closeLogStreams(): void {
    this.client.closeLogStreams();
  }
  public execute(command: string, timeoutSeconds?: number): Promise<string> {
    return this.rcon.execute(command, timeoutSeconds);
  }
  public async inspect(): Promise<RuntimeState> {
    const info = await (await this.client.getManagedContainer()).inspect();
    if (info.State.Paused || info.State.Restarting || info.State.Dead)
      throw new ControllerError(
        "MINECRAFT_MAINTENANCE",
        "The Minecraft container is transitioning or unavailable.",
      );
    const env: Record<string, string> = {};
    for (const entry of info.Config.Env ?? []) {
      const split = entry.indexOf("=");
      if (split > 0) env[entry.slice(0, split)] = entry.slice(split + 1);
    }
    return {
      containerId: info.Id,
      hostname: info.Config.Hostname,
      running: info.State.Running,
      env,
      restartPolicy: info.HostConfig.RestartPolicy ?? { Name: "no" },
    };
  }

  public async stop(): Promise<void> {
    const container = await this.client.getManagedContainer();
    if (!(await container.inspect()).State.Running) return;
    // A timeout must not SIGKILL Minecraft and then call the result a clean backup.
    const stopping = container.stop({ t: -1 });
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        stopping,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new ControllerError(
                  "BACKUP_RECOVERY_REQUIRED",
                  "Minecraft did not stop within two minutes. Automatic restart remains disabled; inspect the server before running backup-recover.",
                ),
              ),
            120_000,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const state = (await container.inspect()).State;
    if (state.Running || state.OOMKilled || state.ExitCode !== 0)
      throw new ControllerError(
        "BACKUP_RECOVERY_REQUIRED",
        "Minecraft did not exit cleanly. Inspect it before continuing recovery.",
      );
  }
  public async start(): Promise<void> {
    try {
      await (await this.client.getManagedContainer()).start();
    } catch (error) {
      if (
        !(
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          error.statusCode === 304
        )
      )
        throw error;
    }
  }
  public async setRestartPolicy(policy: RestartPolicy): Promise<void> {
    await (await this.client.getManagedContainer()).update({ RestartPolicy: policy });
  }
  public async waitReady(): Promise<void> {
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      if (!(await this.inspect()).running)
        throw new ControllerError(
          "BACKUP_CONTROLLER_ERROR",
          "Minecraft exited before becoming ready.",
        );
      try {
        parseOnlinePlayerCount(await this.execute("list"));
        return;
      } catch {
        await delay(2000);
      }
    }
    throw new ControllerError(
      "BACKUP_CONTROLLER_ERROR",
      "Minecraft did not become ready within ten minutes.",
    );
  }
}
