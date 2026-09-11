import { afterEach, describe, expect, it } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, storedZip } from "./test-fixtures.js";
import { compareVersions, readInstallation } from "./versions.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe("installed versions and startup compatibility", () => {
  it("records a floating Vanilla installation but requires pinning before restore", async () => {
    const { root, data } = await fixture();
    roots.push(root);
    await writeFile(
      join(data, ".vanilla-manifest.json"),
      JSON.stringify({ minecraftVersion: "1.21.1", serverEntry: "minecraft_server.1.21.1.jar" }),
    );
    await writeFile(
      join(data, "minecraft_server.1.21.1.jar"),
      storedZip("version.json", JSON.stringify({ id: "1.21.1" })),
    );
    const floating = await readInstallation(data, { TYPE: "VANILLA", VERSION: "LATEST" });
    expect(floating.version?.minecraftVersion).toBe("1.21.1");
    expect(floating.pinned).toBe(false);
    const pinned = await readInstallation(data, { TYPE: "VANILLA", VERSION: "1.21.1" });
    expect(compareVersions(floating.version, pinned).compatible).toBe(true);
    await writeFile(
      join(data, ".vanilla-manifest.json"),
      JSON.stringify({ minecraftVersion: "1.21.2", serverEntry: "minecraft_server.1.21.1.jar" }),
    );
    expect(
      (await readInstallation(data, { TYPE: "VANILLA", VERSION: "1.21.1" })).version,
    ).toBeNull();
  });
  it("requires a pinned Paper build and rejects custom downloads", async () => {
    const { root, data } = await fixture();
    roots.push(root);
    await writeFile(
      join(data, ".papermc-manifest.json"),
      JSON.stringify({
        minecraftVersion: "1.21.1",
        build: 132,
        project: "paper",
        customDownloadUrl: null,
      }),
    );
    const env = { TYPE: "PAPER", VERSION: "1.21.1", PAPER_BUILD: "132" };
    const current = await readInstallation(data, env);
    expect(current.pinned).toBe(true);
    expect(current.version?.loaderVersion).toBe("132");
    expect((await readInstallation(data, { ...env, PAPER_BUILD: "LATEST" })).pinned).toBe(false);
    expect((await readInstallation(data, { ...env, PAPER_CUSTOM_JAR: "custom.jar" })).pinned).toBe(
      false,
    );
  });
  it.each([
    "minecraftVersion",
    "serverType",
    "loader",
    "loaderVersion",
    "modpackId",
    "modpackVersionId",
  ] as const)("rejects a differing %s", async (key) => {
    const { root, data, runtime } = await fixture();
    roots.push(root);
    const current = await readInstallation(data, runtime.state.env);
    const record = {
      ...current.version!,
      [key]: key === "serverType" ? ("PAPER" as const) : "different",
    };
    expect(compareVersions(record, current).compatible).toBe(false);
  });
  it("rejects startup world settings that would load another world", async () => {
    const { root, data, runtime } = await fixture();
    roots.push(root);
    const current = await readInstallation(data, { ...runtime.state.env, LEVEL: "another-world" });
    expect(compareVersions(current.version, current).compatible).toBe(false);
    expect(current.reasons.join(" ")).toContain("world name");
  });
});
