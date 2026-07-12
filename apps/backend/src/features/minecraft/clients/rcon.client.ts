// apps/backend/src/features/minecraft/clients/rcon.client.ts

import { AppError } from "@/errors/app-error.js";
import type { RconApi } from "@/features/minecraft/minecraft.types.js";
import { RCONClient } from "@minecraft-js/rcon";

const DEFAULT_RCON_TIMEOUT_MS = 5_000;

export type RconClientOptions = {
  readonly host: string;
  readonly port: number;
  readonly password: string;
  readonly timeoutMs?: number;
};

export class RconClient implements RconApi {
  private readonly host: string;
  private readonly port: number;
  private readonly password: string;
  private readonly timeoutMs: number;

  public constructor({
    host,
    port,
    password,
    timeoutMs = DEFAULT_RCON_TIMEOUT_MS,
  }: RconClientOptions) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.timeoutMs = timeoutMs;
  }

  public async execute(command: string): Promise<string> {
    const client = new RCONClient(this.host, this.password, this.port);

    // The library reports failures by emitting on the client, and both of
    // these events are fatal to the whole process when nothing listens
    // ('error' by EventEmitter semantics, 'authentication_failed' by a throw
    // inside the socket callback). Keep listeners attached for the client's
    // entire lifetime so failures arriving after this call settles are
    // swallowed rather than crashing the server.
    let failure: Error | undefined;
    client.on("error", (error) => {
      failure ??= error;
    });
    client.on("authentication_failed", () => {
      failure ??= new Error("RCON authentication failed.");
    });

    try {
      await this.connectAndAuthenticate(client);
      return await client.executeCommandAsync(command, this.timeoutMs);
    } catch (error) {
      throw error instanceof AppError
        ? error
        : new AppError("RCON_CLIENT_ERROR", { cause: failure ?? error });
    } finally {
      // Connections are per-command. On socket error the library has already
      // torn the connection down itself (and disconnecting a never-connected
      // client would crash on its missing socket), hence the guard.
      if (client.connected) {
        client.disconnect();
      }
    }
  }

  /** Resolves once RCON login succeeds; rejects on socket/auth failure or timeout. */
  private connectAndAuthenticate(client: RCONClient): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new AppError("RCON_CLIENT_ERROR", { message: "RCON authentication timed out." }));
      }, this.timeoutMs);

      const settle = (outcome: () => void) => {
        clearTimeout(timer);
        outcome();
      };

      client.once("authenticated", () => {
        settle(resolve);
      });
      client.once("authentication_failed", () => {
        settle(() => {
          reject(new AppError("RCON_CLIENT_ERROR", { message: "RCON authentication failed." }));
        });
      });
      client.once("error", (error) => {
        settle(() => {
          reject(error);
        });
      });

      try {
        client.connect();
      } catch (error) {
        settle(() => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      }
    });
  }
}
