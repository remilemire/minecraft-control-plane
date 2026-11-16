import type Dockerode from "dockerode";
import { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import { ControllerError } from "@/errors.js";
import type { DockerClient } from "./docker-client.js";
export function parseOnlinePlayerCount(output: string): number {
  const match = /^There are (\d+) of a max of \d+ players online:/m.exec(output.trim());
  if (!match?.[1])
    throw new ControllerError(
      "BACKUP_CONTROLLER_ERROR",
      "The online player count could not be verified. The server was not stopped.",
    );
  return Number(match[1]);
}

export class DockerRcon {
  private commands: Promise<unknown> = Promise.resolve();
  public constructor(
    private readonly client: DockerClient,
    private readonly docker: Dockerode,
  ) {}
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
    const stdoutDecoder = new StringDecoder("utf8"),
      stderrDecoder = new StringDecoder("utf8");
    const sink = (decoder: StringDecoder) =>
      new Writable({
        write(chunk: Buffer, _encoding, callback) {
          length += chunk.length;
          if (length > 1024 * 1024) {
            callback(new Error("RCON output exceeded its limit"));
            return;
          }
          output += decoder.write(chunk);
          callback();
        },
      });
    const stdout = sink(stdoutDecoder),
      stderr = sink(stderrDecoder);
    for (const stream of [stdout, stderr])
      stream.on("error", (error) => {
        source.destroy(error);
      });
    const timer = setTimeout(
      () => source.destroy(new Error("Docker RCON execution timed out")),
      (timeoutSeconds + 5) * 1000,
    );
    try {
      this.docker.modem.demuxStream(source, stdout, stderr);
      await finished(source);
      if ((await exec.inspect()).ExitCode !== 0)
        throw new ControllerError(
          "BACKUP_CONTROLLER_ERROR",
          "Minecraft did not accept the RCON command. Check server readiness and RCON configuration.",
        );
      return output + stdoutDecoder.end() + stderrDecoder.end();
    } finally {
      clearTimeout(timer);
      stdout.destroy();
      stderr.destroy();
      source.destroy();
    }
  }
}
