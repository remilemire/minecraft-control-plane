// Reuses the running controller; never opens a second journal or scheduler.
import { env } from "@/config.js";
if (process.argv[2] !== "recover") throw new Error("Usage: maintenance/cli recover");
const response = await fetch(
  `http://127.0.0.1:${String(env.MINECRAFT_CONTROLLER_PORT)}/maintenance/recover`,
  {
    method: "POST",
    headers: { authorization: `Bearer ${env.MINECRAFT_CONTROLLER_TOKEN}` },
    signal: AbortSignal.timeout(15 * 60_000),
  },
);
if (!response.ok)
  throw new Error(`Maintenance recovery failed (${response.status}): ${await response.text()}`);
console.log("Maintenance recovery completed.");
