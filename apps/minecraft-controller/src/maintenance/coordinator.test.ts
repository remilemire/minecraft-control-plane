import { describe, expect, it, vi } from "vitest";
import { MaintenanceCoordinator, type JournalEntry, type MaintenanceTask } from "./coordinator.js";

function entry(version = 1): JournalEntry {
  return {
    id: "synthetic-task",
    kind: "switch-test",
    status: "running",
    phase: "Preparing",
    finishedAt: null,
    error: null,
    taskVersion: version,
    checkpoint: null,
    recoverOnReconnect: false,
    cleanupComplete: false,
  };
}
function fixture() {
  const operations: JournalEntry[] = [];
  const events: string[] = [];
  let safety = false;
  const task: MaintenanceTask<JournalEntry> = {
    version: 1,
    legacyVersions: [0],
    destructive: true,
    prepare: async () => {
      events.push("prepare");
    },
    safetyBackup: async () => {
      events.push("safety");
      safety = true;
    },
    safetyBackupVerified: () => safety,
    apply: async () => {
      events.push("apply");
    },
    verify: async () => {
      events.push("verify");
    },
    recover: vi.fn(async () => {
      events.push("recover");
    }),
    hold: vi.fn(async () => {
      events.push("hold");
    }),
    cleanup: vi.fn(async () => {
      events.push("cleanup");
    }),
  };
  const persist = vi.fn(async () => {
    events.push(`persist:${operations.at(-1)?.checkpoint}`);
  });
  const gate = {
    block: vi.fn(async () => {}),
    open: vi.fn(async () => {}),
    boot: async <T>(_id: string, action: () => Promise<T>) => action(),
  };
  const available = vi.fn(async () => {});
  const coordinator = new MaintenanceCoordinator({
    operations: () => operations,
    persist,
    tasks: new Map([["switch-test", task]]),
    gate,
    available,
    describe: String,
    now: () => new Date("2026-11-15T00:00:00Z"),
  });
  return { coordinator, operations, task, persist, events, gate, available };
}
describe("task-neutral maintenance coordinator", () => {
  it("requires a durable verified safety checkpoint before a synthetic destructive task", async () => {
    const { coordinator, events } = fixture();
    await coordinator.ready();
    await coordinator.submit(entry(), () => {});
    await coordinator.wait();
    expect(events).toEqual([
      "persist:null",
      "persist:admitted",
      "prepare",
      "safety",
      "persist:safety-ready",
      "apply",
      "verify",
      "persist:committed",
      "cleanup",
      "persist:committed",
    ]);
    expect(coordinator.active()).toBeNull();
  });
  it("refuses application without safety-backup proof", async () => {
    const { coordinator, task, events } = fixture();
    task.safetyBackupVerified = () => false;
    await coordinator.ready();
    await coordinator.submit(entry(), () => {});
    await coordinator.wait();
    expect(events).not.toContain("apply");
    expect(task.recover).toHaveBeenCalledOnce();
  });
  it("reserves admission synchronously and rejects all concurrent requests", async () => {
    const { coordinator } = fixture();
    await coordinator.ready();
    const submit = coordinator.submit(entry(), () => {});
    await expect(coordinator.exclusive(async () => {})).rejects.toMatchObject({
      code: "MINECRAFT_MAINTENANCE",
    });
    await expect(
      coordinator.submit({ ...entry(), id: "conflicting-task" }, () => {}),
    ).rejects.toMatchObject({
      code: "MINECRAFT_MAINTENANCE",
    });
    await submit;
    await coordinator.wait();
  });
  it("makes admission idempotent while work is still running", async () => {
    const { coordinator, operations } = fixture();
    await coordinator.ready();
    const first = coordinator.submit(entry(), () => {});
    expect(await coordinator.submit(entry(), () => {})).toBe("synthetic-task");
    await first;
    await coordinator.wait();
    expect(operations).toHaveLength(1);
  });
  it.each(["ENOSPC", "EIO"])("holds startup when a %s checkpoint write fails", async (code) => {
    const { coordinator, persist, gate, task, events } = fixture();
    await coordinator.ready();
    gate.open.mockClear();
    persist.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
    await expect(coordinator.submit(entry(), () => {})).rejects.toThrow(code);
    expect(coordinator.active()?.status).toBe("recoveryRequired");
    expect(events).not.toContain("apply");
    expect(task.cleanup).not.toHaveBeenCalled();
    expect(gate.open).not.toHaveBeenCalled();
  });
  it("does not mutate files after an unrecorded safety checkpoint", async () => {
    const { coordinator, persist, task, events } = fixture();
    await coordinator.ready();
    persist.mockImplementation(async () => {
      if (events.includes("safety"))
        throw Object.assign(new Error("Disk full"), { code: "ENOSPC" });
    });
    await coordinator.submit(entry(), () => {});
    await coordinator.wait();
    expect(events).not.toContain("apply");
    expect(task.recover).not.toHaveBeenCalled();
    expect(coordinator.active()?.status).toBe("recoveryRequired");
  });
  it.each([0, 1])(
    "recovers supported journal version %i without replaying application",
    async (version) => {
      const { coordinator, operations, task, events } = fixture();
      operations.push(entry(version));
      await coordinator.recoverInterrupted();
      await coordinator.ready();
      expect(events).not.toContain("apply");
      expect(task.recover).toHaveBeenCalledOnce();
      expect(operations[0]?.status).toBe("failed");
      await coordinator.recoverInterrupted();
      expect(task.recover).toHaveBeenCalledOnce();
    },
  );
  it("holds unknown task versions without running their recovery handlers", async () => {
    const { coordinator, operations, task, gate } = fixture();
    operations.push(entry(99));
    await expect(coordinator.recoverInterrupted()).rejects.toMatchObject({
      code: "BACKUP_RECOVERY_REQUIRED",
    });
    expect(task.recover).not.toHaveBeenCalled();
    expect(gate.open).not.toHaveBeenCalled();
  });
  it("waits for a known Docker outage, then recovers rather than replaying the task", async () => {
    const { coordinator, task, available, events } = fixture();
    task.apply = async () => {
      events.push("apply");
      throw Object.assign(new Error("Docker unavailable"), { code: "ECONNREFUSED" });
    };
    await coordinator.ready();
    await coordinator.submit(entry(), () => {});
    await coordinator.wait();
    expect(coordinator.active()?.recoverOnReconnect).toBe(true);
    available.mockRejectedValueOnce(new Error("Still offline"));
    await coordinator.retry();
    expect(task.recover).not.toHaveBeenCalled();
    await coordinator.retry();
    expect(task.recover).toHaveBeenCalledOnce();
    expect(events.filter((event) => event === "apply")).toHaveLength(1);
  });
  it("does not roll back a durably committed task after a cleanup failure", async () => {
    const { coordinator, task, operations } = fixture();
    task.cleanup = async () => {
      throw new Error("Cleanup interrupted");
    };
    await coordinator.ready();
    await coordinator.submit(entry(), () => {});
    await coordinator.wait();
    await coordinator.recoverInterrupted();
    expect(operations[0]?.status).toBe("succeeded");
    expect(task.recover).not.toHaveBeenCalled();
  });
  it("retries only unfinished cleanup for a committed task after restart", async () => {
    const { coordinator, task, operations } = fixture();
    const cleanup = vi
      .fn()
      .mockRejectedValueOnce(new Error("Cleanup interrupted"))
      .mockResolvedValue(undefined);
    task.cleanup = cleanup;
    await coordinator.ready();
    await coordinator.submit(entry(), () => {});
    await coordinator.wait();
    expect(operations[0]?.cleanupComplete).toBe(false);
    await coordinator.recoverInterrupted();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(task.recover).not.toHaveBeenCalled();
    expect(operations[0]?.cleanupComplete).toBe(true);
    await coordinator.recoverInterrupted();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
  it("holds maintenance after cleanup I/O failure and never rolls back the committed result", async () => {
    const { coordinator, task, gate, operations } = fixture();
    task.cleanup = async () => {
      throw new Error("EIO");
    };
    await coordinator.ready();
    gate.open.mockClear();
    await coordinator.submit(entry(), () => {});
    await coordinator.wait();
    expect(gate.open).not.toHaveBeenCalled();
    expect(coordinator.status(operations[0]!)).toBe("recoveryRequired");
    expect(() => coordinator.assertAvailable()).toThrow();
    task.cleanup = async () => {};
    await coordinator.recover(operations[0]!);
    expect(task.recover).not.toHaveBeenCalled();
    expect(operations[0]?.status).toBe("succeeded");
    expect(coordinator.active()).toBeNull();
  });
});
