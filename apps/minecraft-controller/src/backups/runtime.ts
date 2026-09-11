import type Dockerode from "dockerode";
import { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import type { DockerClient } from "@/docker.js";
import type { RestartPolicy } from "./store.js";
import { BackupError } from "./errors.js";

export interface RuntimeState {
  containerId: string;
  running: boolean;
  env: Record<string, string>;
  restartPolicy: RestartPolicy;
}
export interface BackupRuntime {
  inspect(): Promise<RuntimeState>;
  execute(command: string, timeoutSeconds?: number): Promise<string>;
  stop(): Promise<void>;
  start(): Promise<void>;
  setRestartPolicy(policy: RestartPolicy): Promise<void>;
  waitReady(): Promise<void>;
}

export function playerCount(output: string): number {
  const match = /^There are (\d+) of a max of \d+ players online:/m.exec(output.trim());
  if (!match?.[1])
    throw new BackupError(
      "BACKUP_CONTROLLER_ERROR",
      "The online player count could not be verified. The server was not stopped.",
    );
  return Number(match[1]);
}

export class DockerBackupRuntime implements BackupRuntime {
  private commands: Promise<unknown> = Promise.resolve();
  public constructor(
    private readonly client: DockerClient,
    private readonly docker: Dockerode,
  ) {}

  public async inspect(): Promise<RuntimeState> {
    const info = await (await this.client.getManagedContainer()).inspect();
    if (info.State.Paused || info.State.Restarting || info.State.Dead)
      throw new BackupError(
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
      running: info.State.Running,
      env,
      restartPolicy: info.HostConfig.RestartPolicy ?? { Name: "no" },
    };
  }

  public execute(command: string, timeoutSeconds = 5): Promise<string> {
    const result = this.commands.then(() => this.runCommand(command, timeoutSeconds));
    this.commands = result.catch(() => undefined);
    return result;
  }

  private async runCommand(command: string, timeoutSeconds: number): Promise<string> {
    const container = await this.client.getManagedContainer();
    // Argument arrays avoid a shell. timeout also terminates the remote CLI,
    // unlike destroying only the Docker HTTP stream and leaving RCON connected.
    const exec = await container.exec({
      Cmd: [
        "timeout",
        "--signal=KILL",
        String(timeoutSeconds),
        "rcon-cli",
        "--config",
        "/data/.rcon-cli.yaml",
        "--",
        command,
      ],
      WorkingDir: "/data",
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });
    const source = await exec.start({ hijack: true, stdin: false });
    let output = "";
    let length = 0;
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        length += chunk.length;
        if (length > 1024 * 1024) {
          callback(new Error("RCON output exceeded its limit"));
          return;
        }
        output += chunk.toString("utf8");
        callback();
      },
    });
    sink.on("error", (error) => {
      source.destroy(error);
    });
    const timer = setTimeout(
      () => source.destroy(new Error("Docker RCON execution timed out")),
      (timeoutSeconds + 5) * 1000,
    );
    try {
      this.docker.modem.demuxStream(source, sink, sink);
      await finished(source);
      if ((await exec.inspect()).ExitCode !== 0)
        throw new BackupError(
          "BACKUP_CONTROLLER_ERROR",
          "Minecraft did not accept the RCON command. Check server readiness and RCON configuration.",
        );
      return output;
    } finally {
      clearTimeout(timer);
      sink.destroy();
      source.destroy();
    }
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
                new BackupError(
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
      throw new BackupError(
        "BACKUP_RECOVERY_REQUIRED",
        "Minecraft did not exit cleanly. Inspect it before continuing recovery.",
      );
  }
  public async start(): Promise<void> {
    await this.client.start();
  }
  public async setRestartPolicy(policy: RestartPolicy): Promise<void> {
    await (await this.client.getManagedContainer()).update({ RestartPolicy: policy });
  }
  public async waitReady(): Promise<void> {
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      if (!(await this.inspect()).running)
        throw new BackupError("BACKUP_CONTROLLER_ERROR", "Minecraft exited before becoming ready.");
      try {
        playerCount(await this.execute("list"));
        return;
      } catch {
        await delay(2000);
      }
    }
    throw new BackupError(
      "BACKUP_CONTROLLER_ERROR",
      "Minecraft did not become ready within ten minutes.",
    );
  }
}
