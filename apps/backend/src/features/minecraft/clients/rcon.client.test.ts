// apps/backend/src/features/minecraft/clients/rcon.client.test.ts

// Unit-testing the real client means mocking @minecraft-js/rcon — never open
// real sockets in tests.

import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockRcon {
  authenticated: boolean;
  connected: boolean;
  connect: ReturnType<typeof vi.fn>;
  executeCommandAsync: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  host: string;
  password: string;
  port: number;
}

const rconMock = vi.hoisted(() => {
  const state = {
    // What connect() should simulate, mirroring the real library: emit
    // 'authenticated', emit an 'error' (socket failure), emit
    // 'authentication_failed' (wrong password), stay silent (auth never
    // completes), or throw synchronously.
    connectOutcome: "authenticated" as
      | "authenticated"
      | "socket-error"
      | "auth-failed"
      | "silent"
      | "throws",
    // The real executeCommandAsync rejects with a plain string on timeout.
    commandRejection: undefined as string | undefined,
    response: "command output",
    // When set, executeCommandAsync waits on this before settling, so a test
    // can hold one command open and watch what the next one does.
    gate: undefined as Promise<void> | undefined,
    instances: [] as MockRcon[],
  };
  return { state };
});

vi.mock("@minecraft-js/rcon", async () => {
  const { EventEmitter } = await import("node:events");

  class RCONClient extends EventEmitter {
    public authenticated = false;
    public connected = false;
    public host: string;
    public password: string;
    public port: number;

    public connect = vi.fn(() => {
      switch (rconMock.state.connectOutcome) {
        case "throws":
          throw new Error("connection refused");
        case "socket-error":
          // The real library tears the connection down itself before
          // re-emitting the socket error.
          this.emit("error", new Error("connect ECONNREFUSED 172.20.0.3:25575"));
          break;
        case "auth-failed":
          this.connected = true;
          this.emit("authentication_failed");
          break;
        case "silent":
          this.connected = true;
          break;
        case "authenticated":
          this.connected = true;
          this.authenticated = true;
          this.emit("authenticated");
          break;
      }
      return this;
    });

    public executeCommandAsync = vi.fn(async () => {
      await rconMock.state.gate;
      if (rconMock.state.commandRejection !== undefined) {
        throw rconMock.state.commandRejection;
      }
      return rconMock.state.response;
    });

    public disconnect = vi.fn(() => {
      this.connected = false;
    });

    public constructor(host: string, password: string, port: number) {
      super();
      this.host = host;
      this.password = password;
      this.port = port;
      rconMock.state.instances.push(this as unknown as MockRcon);
    }
  }

  return { RCONClient };
});

const { RconClient } = await import("./rcon.client.js");

const OPTIONS = { host: "localhost", port: 25575, password: "secret", timeoutMs: 60 };

function lastInstance(): MockRcon {
  const instance = rconMock.state.instances.at(-1);
  if (instance === undefined) {
    throw new Error("no RCONClient was constructed");
  }
  return instance;
}

describe("RconClient", () => {
  beforeEach(() => {
    rconMock.state.connectOutcome = "authenticated";
    rconMock.state.commandRejection = undefined;
    rconMock.state.response = "command output";
    rconMock.state.gate = undefined;
    rconMock.state.instances = [];
  });

  it("executes a command once the connection authenticates", async () => {
    const client = new RconClient(OPTIONS);

    const result = await client.execute("list");

    expect(result).toBe("command output");
    const instance = lastInstance();
    expect(instance.connect).toHaveBeenCalledOnce();
    expect(instance.executeCommandAsync).toHaveBeenCalledWith("list", OPTIONS.timeoutMs);
    // Connections are per-command: a successful call must close its socket.
    expect(instance.disconnect).toHaveBeenCalledOnce();
    // Constructed with the configured connection settings.
    expect(instance.host).toBe("localhost");
    expect(instance.port).toBe(25575);
    expect(instance.password).toBe("secret");
  });

  it("rejects with RCON_CLIENT_ERROR when the socket errors instead of crashing", async () => {
    rconMock.state.connectOutcome = "socket-error";

    const client = new RconClient(OPTIONS);

    // The library emits 'error' on the client; unhandled, that event kills
    // the whole process. Reaching this rejection at all proves it's handled.
    await expect(client.execute("list")).rejects.toMatchObject({
      code: "RCON_CLIENT_ERROR",
      cause: new Error("connect ECONNREFUSED 172.20.0.3:25575"),
    });
    // The library already tore the connection down in its own error handler.
    expect(lastInstance().disconnect).not.toHaveBeenCalled();
  });

  it("rejects with RCON_CLIENT_ERROR when authentication fails", async () => {
    rconMock.state.connectOutcome = "auth-failed";

    const client = new RconClient(OPTIONS);

    await expect(client.execute("list")).rejects.toMatchObject({
      code: "RCON_CLIENT_ERROR",
      message: "RCON authentication failed.",
    });
    expect(lastInstance().disconnect).toHaveBeenCalledOnce();
  });

  it("throws RCON_CLIENT_ERROR when authentication times out", async () => {
    rconMock.state.connectOutcome = "silent";

    const client = new RconClient(OPTIONS);

    await expect(client.execute("list")).rejects.toMatchObject({
      code: "RCON_CLIENT_ERROR",
      message: "RCON authentication timed out.",
    });
    // A never-authenticated client is disconnected rather than left dangling.
    expect(lastInstance().disconnect).toHaveBeenCalledOnce();
  });

  it("wraps synchronous connect failures in RCON_CLIENT_ERROR", async () => {
    rconMock.state.connectOutcome = "throws";

    const client = new RconClient(OPTIONS);

    await expect(client.execute("list")).rejects.toMatchObject({
      code: "RCON_CLIENT_ERROR",
      cause: new Error("connection refused"),
    });
    // Nothing connected, so there is nothing to disconnect (the real
    // library's disconnect would crash on its never-created socket).
    expect(lastInstance().disconnect).not.toHaveBeenCalled();
  });

  it("wraps command failures in RCON_CLIENT_ERROR and still disconnects", async () => {
    rconMock.state.commandRejection = "RCONClient#executeCommandAsync didn't resolve";

    const client = new RconClient(OPTIONS);

    await expect(client.execute("list")).rejects.toMatchObject({
      code: "RCON_CLIENT_ERROR",
      cause: "RCONClient#executeCommandAsync didn't resolve",
    });
    expect(lastInstance().disconnect).toHaveBeenCalledOnce();
  });

  // Vanilla bleeds one connection's command output into another's response when
  // RCON connections overlap, which corrupted `list` replies with the error text
  // from the library's pipelined `me` probe. Overlapping calls must queue.
  it("serializes overlapping commands onto one connection at a time", async () => {
    let release!: () => void;
    rconMock.state.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const client = new RconClient(OPTIONS);
    const first = client.execute("list");
    const second = client.execute("whitelist add Notch");

    // A single microtask tick isn't enough hops to reach the second command.
    await new Promise((resolve) => setImmediate(resolve));

    // The second command must not have opened a socket while the first is in
    // flight — that overlap is the whole bug.
    expect(rconMock.state.instances).toHaveLength(1);

    rconMock.state.gate = undefined;
    release();
    await Promise.all([first, second]);

    expect(rconMock.state.instances).toHaveLength(2);
    expect(rconMock.state.instances[0]?.executeCommandAsync).toHaveBeenCalledWith(
      "list",
      OPTIONS.timeoutMs,
    );
    expect(rconMock.state.instances[1]?.executeCommandAsync).toHaveBeenCalledWith(
      "whitelist add Notch",
      OPTIONS.timeoutMs,
    );
  });

  it("keeps serving commands after one fails", async () => {
    rconMock.state.connectOutcome = "throws";

    const client = new RconClient(OPTIONS);

    await expect(client.execute("list")).rejects.toMatchObject({ code: "RCON_CLIENT_ERROR" });

    // A rejection must not poison the queue for everything behind it.
    rconMock.state.connectOutcome = "authenticated";
    expect(await client.execute("list")).toBe("command output");
  });
});
