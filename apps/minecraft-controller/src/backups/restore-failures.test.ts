import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture, finish, takeBackup } from "./test-fixtures.js";
import { ControllerError } from "@/errors.js";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof fs>();
  return { ...actual, rename: vi.fn(actual.rename), statfs: vi.fn(actual.statfs) };
});
const roots: string[] = [];
afterEach(async () => {
  vi.mocked(fs.rename).mockReset();
  const actual = await vi.importActual<typeof fs>("node:fs/promises");
  vi.mocked(fs.rename).mockImplementation(actual.rename);
  vi.mocked(fs.statfs).mockImplementation(actual.statfs);
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
describe("restore failure boundaries", () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])(
    "preserves original data after replacement move %i fails",
    async (cut) => {
      const { controller, root, data, runtime } = await fixture();
      roots.push(root);
      const backup = await takeBackup(controller.backups, controller.maintenance);
      await fs.writeFile(join(data, "world/level.dat"), "current world");
      await fs.writeFile(join(data, "mods/current.jar"), "current mods");
      const actual = await vi.importActual<typeof fs>("node:fs/promises");
      let moves = 0;
      let injected = false;
      vi.mocked(fs.rename).mockImplementation(async (from, to) => {
        if (
          !injected &&
          (String(from).startsWith(`${data}/`) || String(from).includes("/staged/"))
        ) {
          if (moves++ === cut) {
            injected = true;
            throw new Error("Injected replacement IO failure");
          }
        }
        return actual.rename(from, to);
      });
      const operation = await finish(
        controller.maintenance,
        await controller.backups.restore(backup, randomUUID()),
      );
      expect(injected).toBe(true);
      expect(operation.status).toBe("failed");
      expect(await fs.readFile(join(data, "world/level.dat"), "utf8")).toBe("current world");
      expect(await fs.readFile(join(data, "mods/current.jar"), "utf8")).toBe("current mods");
      expect(runtime.state.running).toBe(true);
      expect(runtime.state.restartPolicy.Name).toBe("unless-stopped");
    },
  );
  it("checks free space before interrupting Minecraft", async () => {
    const { controller, root, runtime } = await fixture();
    roots.push(root);
    const backup = await takeBackup(controller.backups, controller.maintenance);
    runtime.calls = [];
    const stat = await fs.statfs(root);
    vi.mocked(fs.statfs).mockResolvedValue({ ...stat, bavail: 0 });
    expect((await controller.backups.preview(backup)).canRestore).toBe(false);
    expect(
      (await finish(controller.maintenance, await controller.backups.restore(backup, randomUUID())))
        .status,
    ).toBe("failed");
    expect(runtime.calls).toEqual([]);
  });
  it("restores saving after an online backup runs out of space", async () => {
    const { controller, root, runtime } = await fixture();
    roots.push(root);
    runtime.players = 1;
    const stat = await fs.statfs(root);
    vi.mocked(fs.statfs).mockResolvedValue({ ...stat, bavail: 0 });
    expect(
      (await finish(controller.maintenance, await controller.backups.create(randomUUID()))).status,
    ).toBe("failed");
    expect(runtime.commands.at(-1)).toBe("save-on");
    expect((await controller.backups.list()).backups).toHaveLength(0);
  });
  it("does not restart or replace data when graceful stopping has an uncertain outcome", async () => {
    const { controller, root, data, runtime } = await fixture();
    roots.push(root);
    const backup = await takeBackup(controller.backups, controller.maintenance);
    await fs.writeFile(join(data, "world/level.dat"), "current world");
    runtime.calls = [];
    vi.spyOn(runtime, "stop").mockRejectedValue(
      new ControllerError("BACKUP_RECOVERY_REQUIRED", "Stop timed out"),
    );
    expect(
      (await finish(controller.maintenance, await controller.backups.restore(backup, randomUUID())))
        .status,
    ).toBe("recoveryRequired");
    expect(await fs.readFile(join(data, "world/level.dat"), "utf8")).toBe("current world");
    expect(runtime.calls).not.toContain("start");
    expect(runtime.state.restartPolicy.Name).toBe("no");
  });
});
