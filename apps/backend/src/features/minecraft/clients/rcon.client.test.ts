import { afterEach, describe, expect, it, vi } from "vitest";
import { RconClient } from "./rcon.client.js";

const client = () => new RconClient({ baseUrl: "http://controller:8000", token: "test-token" });
afterEach(() => vi.unstubAllGlobals());
describe("RconClient through the maintenance coordinator", () => {
  it("sends commands as authenticated JSON and returns the exact output", async () => {
    const fetch = vi.fn(async () => Response.json({ output: "Saved the game\n" }));
    vi.stubGlobal("fetch", fetch);
    expect(await client().execute("save-all flush")).toBe("Saved the game\n");
    expect(fetch).toHaveBeenCalledWith(
      new URL("http://controller:8000/rcon"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ command: "save-all flush" }),
        headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      }),
    );
  });
  it("preserves maintenance errors so whitelist delivery can defer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ code: "MINECRAFT_MAINTENANCE" }, { status: 409 })),
    );
    await expect(client().execute("whitelist add Alex")).rejects.toMatchObject({
      code: "MINECRAFT_MAINTENANCE",
    });
  });
  it("maps connection and response failures to RCON_CLIENT_ERROR", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ unexpected: true }));
    vi.stubGlobal("fetch", fetch);
    await expect(client().execute("list")).rejects.toMatchObject({ code: "RCON_CLIENT_ERROR" });
    await expect(client().execute("list")).rejects.toMatchObject({ code: "RCON_CLIENT_ERROR" });
  });
  it("rejects multiline commands before sending", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(client().execute("list\nstop")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
