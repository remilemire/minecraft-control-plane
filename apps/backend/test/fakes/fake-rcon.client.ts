// apps/backend/test/fakes/fake-rcon.client.ts

import type { RconApi } from "@/features/minecraft/minecraft.types.js";

// The vanilla `list` command's reply format (see minecraft/server/server.service.ts);
// used as the default so callers that don't care about online status don't
// have to stub it every time.
const DEFAULT_LIST_RESPONSE = "There are 0 of a max of 20 players online:";

// In-memory stand-in for the RCON connection. Records every executed command
// and answers with responses registered via respondTo() (empty string
// otherwise, which is what the real server returns for most commands), or
// throws for commands registered via failOn().
export class FakeRconClient implements RconApi {
  public readonly executed: string[] = [];

  private readonly responses = new Map<string, string>([["list", DEFAULT_LIST_RESPONSE]]);
  private readonly failures = new Map<string, Error>();

  public respondTo(command: string, response: string): void {
    this.responses.set(command, response);
  }

  public failOn(command: string, error: Error = new Error(`RCON failure for "${command}"`)): void {
    this.failures.set(command, error);
  }

  public async execute(command: string): Promise<string> {
    this.executed.push(command);

    const failure = this.failures.get(command);
    if (failure !== undefined) {
      throw failure;
    }

    return this.responses.get(command) ?? "";
  }
}
