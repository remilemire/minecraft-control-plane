// Linux-only IO drill. Run on a small disposable tmpfs, never a persistent disk.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, open, rm, statfs } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import console from "node:console";
import { StateService } from "../../dist/state/service.js";

const mount = process.argv[2];
assert.equal(mount, "/disk-full-drill");
assert.equal((await statfs(mount)).type, 0x01021994, "The drill requires a disposable tmpfs.");
const root = await mkdtemp(join(mount, "state-"));
const state = new StateService(root, "UTC", () => {
  throw new Error("No task should run in the storage-only drill.");
});
await state.initialize();
const filler = join(mount, "filler");
const file = await open(filler, "wx");
try {
  for (;;) await file.write(Buffer.alloc(64 * 1024));
} catch (error) {
  assert.equal(error.code, "ENOSPC");
} finally {
  await file.close();
}
const schedules = state.schedules();
const previous = schedules.read();
const next = { ...previous, enabled: { ...previous.enabled, daily: true } };
await assert.rejects(schedules.commit([schedules.configure(next)]), (error) => {
  assert.equal(error.code, "BACKUP_RECOVERY_REQUIRED");
  assert.equal(error.cause.code, "ENOSPC");
  return true;
});
assert.equal(schedules.read().enabled.daily, false);
assert.equal(state.journal().healthy(), false);
await assert.rejects(state.catalogue().commit([]));
await rm(filler);
await state.reopen();
assert.equal(state.journal().healthy(), true);
assert.equal(schedules.read().enabled.daily, false);
await schedules.commit([schedules.configure(next)]);
await state.reopen();
assert.equal(schedules.read().enabled.daily, true);
console.log(
  JSON.stringify({
    actualError: "ENOSPC",
    uncommittedDraftDiscarded: true,
    furtherWritesFenced: true,
    reopenedAndCommittedAfterSpaceFreed: true,
  }),
);
await rm(root, { recursive: true });
