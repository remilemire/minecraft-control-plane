// Runs inside the existing controller container; talks to its coordinator so
// migration/recovery cannot race an HTTP operation or another scheduler.
import { env } from "@/config.js";
import { randomUUID } from "node:crypto";
import {
  backupOperationAcceptedSchema,
  maintenanceOperationSchema,
} from "@minecraft-control-plane/shared/minecraft";
import { setTimeout as delay } from "node:timers/promises";

const action = process.argv[2];
if (action !== "migrate" && action !== "recover")
  throw new Error("Usage: backups/cli migrate|recover");
const base = `http://127.0.0.1:${String(env.MINECRAFT_CONTROLLER_PORT)}`;
const headers = {
  authorization: `Bearer ${env.MINECRAFT_CONTROLLER_TOKEN}`,
  "content-type": "application/json",
};
const response = await fetch(`${base}/backups/${action}`, {
  method: "POST",
  headers,
  body: JSON.stringify({ requestId: randomUUID() }),
});
if (!response.ok)
  throw new Error(`Backup ${action} failed (${String(response.status)}): ${await response.text()}`);
if (response.status === 202) {
  const { operationId } = backupOperationAcceptedSchema.parse(await response.json());
  let lastPhase = "";
  for (;;) {
    const result = await fetch(`${base}/backups/operations/${operationId}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!result.ok)
      throw new Error(`Cannot read operation ${operationId}; check the panel before retrying.`);
    const operation = maintenanceOperationSchema.parse(await result.json());
    if (operation.phase !== lastPhase) {
      console.log(operation.phase);
      lastPhase = operation.phase;
    }
    if (operation.status === "succeeded") break;
    if (operation.status !== "running")
      throw new Error(operation.error ?? "Backup operation failed.");
    await delay(1000);
  }
}
console.log(`Backup ${action} completed.`);
