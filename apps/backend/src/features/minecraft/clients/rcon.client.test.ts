// apps/backend/src/features/minecraft/clients/rcon.client.test.ts

// Unit-testing the real client means mocking @minecraft-js/rcon — never open
// real sockets in tests.

import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockRcon {
  authenticated: boolean;
  connect: ReturnType<typeof vi.fn>;
  executeCommandAsync: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  host: string;
  password: string;
  port: number;
}

const rconMock = vi.hoisted(() => {
  const state = {
    authenticateOnConnect: true,
    connectThrows: false,
    response: "command output",
    instances: [] as MockRcon[],
  };
  return { state };
});

vi.mock("@minecraft-js/rcon", () => {
  class RCONClient {
    public authenticated = false;
    public host: string;
    public password: string;
    public port: number;
    public connect = vi.fn(() => {
      if (rconMock.state.connectThrows) {
        throw new Error("connection refused");
      }
      if (rconMock.state.authenticateOnConnect) {
        this.authenticated = true;
      }
      return this;
    });
    public executeCommandAsync = vi.fn(async () => rconMock.state.response);
    public disconnect = vi.fn();

    public constructor(host: string, password: string, port: number) {
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
    rconMock.state.authenticateOnConnect = true;
    rconMock.state.connectThrows = false;
    rconMock.state.response = "command output";
    rconMock.state.instances = [];
  });

  it("executes a command once the connection authenticates", async () => {
    const client = new RconClient(OPTIONS);

    const result = await client.execute("list");

    expect(result).toBe("command output");
    const instance = lastInstance();
    expect(instance.connect).toHaveBeenCalledOnce();
    expect(instance.executeCommandAsync).toHaveBeenCalledWith("list", OPTIONS.timeoutMs);
    // Constructed with the configured connection settings.
    expect(instance.host).toBe("localhost");
    expect(instance.port).toBe(25575);
    expect(instance.password).toBe("secret");
  });

  it("throws RCON_CLIENT_ERROR when authentication times out", async () => {
    rconMock.state.authenticateOnConnect = false;

    const client = new RconClient(OPTIONS);

    await expect(client.execute("list")).rejects.toMatchObject({ code: "RCON_CLIENT_ERROR" });
    // A never-authenticated client is disconnected rather than left dangling.
    expect(lastInstance().disconnect).toHaveBeenCalledOnce();
  });

  it("disconnects on connection failure", async () => {
    rconMock.state.connectThrows = true;

    const client = new RconClient(OPTIONS);

    await expect(client.execute("list")).rejects.toThrow("connection refused");
    expect(lastInstance().disconnect).toHaveBeenCalledOnce();
  });
});
