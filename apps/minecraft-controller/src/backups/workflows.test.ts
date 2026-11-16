import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import supertest from "supertest";
import {
  fixture,
  finish,
  backup,
  authorization,
  TestClock,
  deferred,
} from "@test/support/controller.js";

it("creates a verified full snapshot through HTTP and restores changed world/server files", async () => {
  const f = await fixture();
  const accepted = await supertest(f.app)
    .post("/backups")
    .set("authorization", authorization)
    .send({ requestId: randomUUID() });
  expect(accepted.status).toBe(202);
  const op = await finish(f.controller, accepted.body.operationId);
  expect(op.status).toBe("succeeded");
  const id = op.backupId!;
  expect(f.runtime.javaRunning).toBe(true);
  expect(f.runtime.state.restartPolicy.Name).toBe("unless-stopped");
  await writeFile(join(f.data, "world/level.dat"), "pre-restore world");
  await writeFile(join(f.data, "mods/added.jar"), "new mod");
  await writeFile(join(f.data, "whitelist.json"), "current access");
  await writeFile(
    join(f.data, "server.properties"),
    "level-name=world\nrcon.password=new-secret\nwhite-list=true\ndifficulty=hard\n",
  );
  expect((await f.controller.backups.preview(id)).canRestore).toBe(true);
  const result = await finish(f.controller, await f.controller.backups.restore(id, randomUUID()));
  expect(result.status).toBe("succeeded");
  expect(await readFile(join(f.data, "world/level.dat"), "utf8")).toBe("original world");
  await expect(stat(join(f.data, "mods/added.jar"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(f.data, "whitelist.json"), "utf8")).toBe("current access");
  const props = await readFile(join(f.data, "server.properties"), "utf8");
  expect(props).toContain("new-secret");
  expect(props).not.toContain("difficulty=hard");
  expect(
    (await f.controller.backups.list()).backups.find((b) => b.id === result.safetyBackupId)?.origin,
  ).toBe("safety");
  expect(f.runtime.javaRunning).toBe(true);
  expect("storage" in f.controller.backups).toBe(false);
  expect("capture" in f.controller.backups).toBe(false);
  expect("activeJournal" in f.controller.maintenance).toBe(false);
});
it("keeps a stopped server stopped for backup and restore", async () => {
  const f = await fixture({ running: false }),
    id = await backup(f.controller);
  await writeFile(join(f.data, "world/level.dat"), "later");
  expect(
    (await finish(f.controller, await f.controller.backups.restore(id, randomUUID()))).status,
  ).toBe("succeeded");
  expect(f.runtime.state.running).toBe(false);
  expect(f.runtime.calls).not.toContain("start");
});
it("uses saving controls online and restores saving after a flush error", async () => {
  const f = await fixture();
  f.runtime.playerCount = 1;
  const id = await backup(f.controller);
  expect((await f.controller.backups.list()).backups.find((b) => b.id === id)?.method).toBe(
    "online",
  );
  expect(f.runtime.calls).not.toContain("stop");
  expect(f.runtime.savingEnabled).toBe(true);
  f.runtime.commandFailure = "save-all flush";
  expect((await finish(f.controller, await f.controller.backups.create(randomUUID()))).status).toBe(
    "failed",
  );
  expect(f.runtime.savingEnabled).toBe(true);
  expect(f.runtime.commands.at(-1)).toBe("save-on");
});
it("rejects an unknown player count without stopping Minecraft", async () => {
  const f = await fixture();
  f.runtime.commandFailure = "list";
  expect((await finish(f.controller, await f.controller.backups.create(randomUUID()))).status).toBe(
    "failed",
  );
  expect(f.runtime.calls).not.toContain("stop");
});
it("announces restoration and waits the full countdown before stopping a populated server", async () => {
  const countdown = deferred();
  class HoldingClock extends TestClock {
    public override async sleep(milliseconds: number): Promise<void> {
      await super.sleep(milliseconds);
      await countdown.promise;
    }
  }
  const f = await fixture({ clock: new HoldingClock() }),
    id = await backup(f.controller);
  f.runtime.playerCount = 1;
  f.runtime.calls.length = 0;
  const operation = await f.controller.backups.restore(id, randomUUID());
  try {
    await vi.waitFor(() => expect(f.clock.sleeps).toEqual([30_000]));
    expect(f.runtime.commands.some((command) => command.startsWith("say "))).toBe(true);
    expect(f.runtime.calls).not.toContain("stop");
    expect(f.controller.maintenance.operation(operation).status).toBe("running");
  } finally {
    countdown.resolve(undefined);
  }
  expect((await finish(f.controller, operation)).status).toBe("succeeded");
  expect(f.runtime.calls).toContain("stop");
});
it("rolls back verified pre-task data when the restored server fails readiness", async () => {
  const f = await fixture(),
    id = await backup(f.controller);
  await writeFile(join(f.data, "world/level.dat"), "pre-restore world");
  await writeFile(join(f.data, "mods/current.jar"), "pre-restore mod");
  f.runtime.readinessFailures = 1;
  const result = await finish(f.controller, await f.controller.backups.restore(id, randomUUID()));
  expect(result.status).toBe("failed");
  expect(await readFile(join(f.data, "world/level.dat"), "utf8")).toBe("pre-restore world");
  expect(await readFile(join(f.data, "mods/current.jar"), "utf8")).toBe("pre-restore mod");
  expect(f.runtime.javaRunning).toBe(true);
  expect(f.runtime.state.restartPolicy.Name).toBe("unless-stopped");
});
it("holds a stopped server when neither restored nor original data becomes ready", async () => {
  const f = await fixture(),
    id = await backup(f.controller);
  await writeFile(join(f.data, "world/level.dat"), "pre-restore world");
  f.runtime.readinessFailures = 2;
  expect(
    (await finish(f.controller, await f.controller.backups.restore(id, randomUUID()))).status,
  ).toBe("recoveryRequired");
  expect(f.runtime.state.running).toBe(false);
  expect(await readFile(join(f.data, "world/level.dat"), "utf8")).toBe("pre-restore world");
  await expect(f.controller.server.power("start")).rejects.toMatchObject({
    code: "BACKUP_RECOVERY_REQUIRED",
  });
  await f.controller.maintenance.recover();
  expect(f.runtime.javaRunning).toBe(true);
});
it("rejects incompatible or corrupt archives before stopping or changing the world", async () => {
  const f = await fixture(),
    id = await backup(f.controller);
  f.runtime.calls.length = 0;
  f.runtime.state.env.FTB_MODPACK_VERSION_ID = "different";
  expect((await f.controller.backups.preview(id)).canRestore).toBe(false);
  expect(
    (await finish(f.controller, await f.controller.backups.restore(id, randomUUID()))).status,
  ).toBe("failed");
  expect(f.runtime.calls).not.toContain("stop");
  f.runtime.state.env.FTB_MODPACK_VERSION_ID = "100440";
  await writeFile(join(f.root, "backups", id, "archive.tar.gz"), "corrupt");
  expect(
    (await finish(f.controller, await f.controller.backups.restore(id, randomUUID()))).status,
  ).toBe("failed");
  expect(f.runtime.calls).not.toContain("stop");
});
it("deduplicates requests and rejects conflicting API writes during restore", async () => {
  const f = await fixture(),
    id = await backup(f.controller),
    requestId = randomUUID(),
    hold = f.runtime.holdStop();
  const operation = await f.controller.backups.restore(id, requestId);
  await vi.waitFor(() => expect(f.runtime.state.running).toBe(false));
  expect(await f.controller.backups.restore(id, requestId)).toBe(operation);
  await expect(f.controller.backups.create(requestId)).rejects.toMatchObject({
    code: "BACKUP_REQUEST_CONFLICT",
  });
  for (const path of ["/start", "/restart"]) {
    expect((await supertest(f.app).post(path).set("authorization", authorization)).status).toBe(
      409,
    );
  }
  expect(
    (
      await supertest(f.app)
        .delete("/backups/" + id)
        .set("authorization", authorization)
    ).status,
  ).toBe(409);
  expect((await supertest(f.app).get("/status").set("authorization", authorization)).status).toBe(
    200,
  );
  hold.resolve(undefined);
  expect((await finish(f.controller, operation)).status).toBe("succeeded");
});
it("retains committed restore data after cleanup fails and projects one consistent status", async () => {
  const f = await fixture(),
    id = await backup(f.controller);
  await writeFile(join(f.data, "world/level.dat"), "pre-restore world");
  const hold = f.runtime.holdReady();
  const operation = await f.controller.backups.restore(id, randomUUID());
  await vi.waitFor(() => expect(f.runtime.upstreamStarts).toBe(2));
  const recovery = join(f.root, "backup-recovery"),
    hidden = join(f.root, "recovery-hidden");
  await rename(recovery, hidden);
  await writeFile(recovery, "blocked cleanup");
  hold.resolve(undefined);
  const result = await finish(f.controller, operation);
  expect(result.status).toBe("recoveryRequired");
  const list = await f.controller.backups.list();
  expect(list.activeOperation?.status).toBe("recoveryRequired");
  expect(list.latestOperation?.status).toBe("recoveryRequired");
  await rm(recovery);
  await rename(hidden, recovery);
  await f.controller.maintenance.recover();
  expect(await readFile(join(f.data, "world/level.dat"), "utf8")).toBe("original world");
  expect(f.controller.maintenance.operation(operation).status).toBe("succeeded");
});
it("retains durable deletion intent and blocks mutations when archive removal fails", async () => {
  const f = await fixture(),
    id = await backup(f.controller),
    archives = join(f.root, "backups"),
    hidden = join(f.root, "archives-hidden");
  await rename(archives, hidden);
  await writeFile(archives, "blocked storage");
  await expect(f.controller.backups.delete(id)).rejects.toMatchObject({
    code: "BACKUP_RECOVERY_REQUIRED",
  });
  await expect(f.controller.server.execute("list")).rejects.toMatchObject({
    code: "BACKUP_RECOVERY_REQUIRED",
  });
  expect(
    JSON.parse(await readFile(join(f.root, "backup-state/state.json"), "utf8")).pendingDeletes,
  ).toEqual([id]);
  await rm(archives);
  await rename(hidden, archives);
  await f.controller.maintenance.recover();
  expect((await f.controller.backups.list()).backups.some((b) => b.id === id)).toBe(false);
});
it("keeps previous settings visible and fences mutations after a real failed state write", async () => {
  const f = await fixture(),
    state = join(f.root, "backup-state/state.json"),
    saved = join(f.root, "backup-state/saved.json");
  await rename(state, saved);
  await mkdir(state);
  await expect(
    f.controller.backups.updateSchedules({
      hourly: false,
      daily: true,
      weekly: false,
      monthly: false,
    }),
  ).rejects.toMatchObject({ code: "BACKUP_RECOVERY_REQUIRED" });
  expect(f.controller.backups.schedules().enabled.daily).toBe(false);
  await expect(f.controller.server.execute("list")).rejects.toMatchObject({
    code: "BACKUP_RECOVERY_REQUIRED",
  });
  await f.runtime.stop();
  await f.runtime.start();
  await new Promise((r) => setTimeout(r, 250));
  expect(f.runtime.javaRunning).toBe(false);
  await rm(state, { recursive: true });
  await rename(saved, state);
  await f.controller.maintenance.recover();
  await vi.waitFor(() => expect(f.runtime.javaRunning).toBe(true));
  expect(f.controller.backups.schedules().enabled.daily).toBe(false);
});
