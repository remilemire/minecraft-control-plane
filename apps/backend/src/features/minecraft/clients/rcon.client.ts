// apps/backend/src/features/minecraft/clients/rcon.client.ts

import { RconClientError } from "@/features/minecraft/minecraft.errors.js";
import { RCONClient } from "@minecraft-js/rcon";

const DEFAULT_RCON_TIMEOUT_MS = 5_000;
const AUTH_POLL_INTERVAL_MS = 25;

export type RconClientOptions = {
  readonly host: string;
  readonly port: number;
  readonly password: string;
  readonly timeoutMs?: number;
};

export class RconClient {
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
    const client = await this.getConnectedClient();
    return client.executeCommandAsync(command, this.timeoutMs);
  }

  private async getConnectedClient(): Promise<RCONClient> {
    const client = new RCONClient(this.host, this.password, this.port);

    try {
      client.connect();
      await this.waitUntilAuthenticated(client);
    } catch (error) {
      client.disconnect();
      throw error;
    }

    return client;
  }

  private async waitUntilAuthenticated(client: RCONClient): Promise<void> {
    const deadline = Date.now() + this.timeoutMs;

    while (!client.authenticated) {
      if (Date.now() >= deadline) {
        throw new RconClientError("RCON authentication timed out.");
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, AUTH_POLL_INTERVAL_MS);
      });
    }
  }
}
