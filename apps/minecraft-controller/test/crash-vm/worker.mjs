// Isolated test runner: launches the unchanged production entrypoint and uses
// V8 debugger breakpoints. No controller class is replaced or given test hooks.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { setInterval } from "node:timers";
import process from "node:process";
import console from "node:console";
const { WebSocket, fetch, AbortSignal } = globalThis;
const token = process.env.DRILL_TOKEN;
let armed = process.env.DRILL_BARRIER ? JSON.parse(process.env.DRILL_BARRIER) : null;
let reached = null,
  initialized = false,
  paused = false,
  protocol = null,
  breakpoints = [];
let inspectorSocket;
const child = spawn(process.execPath, ["--inspect-brk=127.0.0.1:0", "dist/server.js"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});
child.stdout.pipe(process.stdout);
let endpointText = "",
  endpointResolve;
const endpoint = new Promise((resolve) => {
  endpointResolve = resolve;
});
child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  endpointText += String(chunk);
  const match = /ws:\/\/127\.0\.0\.1:[0-9]+\/[^\s]+/.exec(endpointText);
  if (match) endpointResolve(match[0]);
  // Node waits for attached debuggers before exiting, including an initialization
  // failure. Let the unchanged server emit its error and terminate normally.
  if (String(chunk).includes("Waiting for the debugger to disconnect")) inspectorSocket?.close();
});
child.once("exit", (code) => {
  process.exit(code ?? 1);
});
process.once("SIGTERM", () => child.kill("SIGTERM"));
process.once("SIGINT", () => child.kill("SIGINT"));
async function state() {
  try {
    return JSON.parse(await readFile("/server-data/backup-state/state.json", "utf8"));
  } catch {
    return null;
  }
}
function active(value) {
  return (
    value?.operations.find((op) => op.status === "running" || op.status === "recoveryRequired") ??
    value?.operations.at(-1)
  );
}
async function resume() {
  if (paused) {
    paused = false;
    await protocol.call("Debugger.resume");
  }
}
async function configure() {
  if (!protocol) return;
  for (const id of breakpoints)
    await protocol.call("Debugger.removeBreakpoint", { breakpointId: id });
  breakpoints = [];
  if (!armed) return;
  const event = armed.event;
  let file,
    needle,
    offset = 0,
    condition = "";
  if (event.startsWith("archive-entry:")) {
    file = "backups/archive.js";
    needle = "entries.push(entrySchema.parse(item))";
    condition = `typeof item !== 'undefined' && item.path === ${JSON.stringify(event.slice(14))}`;
  } else if (event.startsWith("staged-entry:")) {
    file = "backups/archive.js";
    needle = "seen.add(name)";
    condition = `typeof destination === 'string' && name === ${JSON.stringify(event.slice(13))}`;
  } else if (event === "verification-boot") {
    file = "runtime/minecraft-runtime.js";
    needle = 'parseOnlinePlayerCount(await this.execute("list"))';
    offset = 1;
  } else if (event === "before-commit") {
    file = "maintenance/coordinator.js";
    needle = "async terminal(";
    offset = 1;
    condition = "status === 'succeeded'";
  } else {
    file = "state/service.js";
    needle = "this.current = next";
  }
  const lines = (await readFile("/app/dist/" + file, "utf8")).split("\n");
  // players() uses the same parser. Scope this breakpoint to the readiness loop.
  const start =
    event === "verification-boot"
      ? lines.findIndex((line) => line.includes("async waitReady("))
      : 0;
  if (start < 0) throw new Error("No production readiness loop found");
  const index = lines.findIndex((line, number) => number >= start && line.includes(needle));
  if (index < 0) throw new Error("No production debugger location for " + event);
  const result = await protocol.call("Debugger.setBreakpointByUrl", {
    urlRegex: "/dist/" + file.replaceAll(".", "\\.") + "$",
    lineNumber: index + offset,
    condition,
  });
  breakpoints.push(result.breakpointId);
}
async function onPaused(event) {
  paused = true;
  if (!armed || !event.hitBreakpoints?.some((id) => breakpoints.includes(id))) {
    await resume();
    return;
  }
  const value = await state(),
    op = active(value);
  if (!op || op.kind !== armed.kind || (armed.phase && op.phase !== armed.phase)) {
    await resume();
    return;
  }
  const eventName = armed.event;
  if (
    eventName === "verification-boot" &&
    (op.checkpoint !== "boot-safe" ||
      op.phase !== "Starting Minecraft and checking readiness" ||
      !op.data.replacementComplete ||
      !op.data.liveDataSafe ||
      op.data.rollbackPending)
  ) {
    await resume();
    return;
  }
  if (
    eventName === "committed" &&
    (op.status !== "succeeded" || op.checkpoint !== "committed" || op.cleanupComplete)
  ) {
    await resume();
    return;
  }
  if (eventName.startsWith("moved:") && op.checkpoint !== eventName) {
    await resume();
    return;
  }
  reached = { ...op, ...op.data, ...op.result, event: eventName, productionPid: child.pid };
  console.log("DEBUGGER BARRIER", JSON.stringify(reached));
}
const control = createServer(async (req, res) => {
  try {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end();
      return;
    }
    let text = "";
    for await (const chunk of req) text += String(chunk);
    if (req.method === "POST") {
      const input = JSON.parse(text);
      if (input.release) {
        armed = null;
        await configure();
        await resume();
      } else {
        armed = input;
        reached = null;
        await configure();
      }
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        armed,
        reached,
        initialized,
        state: await state(),
        productionPid: child.pid,
        paused,
      }),
    );
  } catch (error) {
    res.writeHead(500).end(JSON.stringify({ error: String(error) }));
  }
});
control.listen(8999);
const socket = new WebSocket(await endpoint);
inspectorSocket = socket;
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let sequence = 0;
const pending = new Map();
protocol = {
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  },
};
socket.addEventListener("message", (message) => {
  const event = JSON.parse(String(message.data));
  if (event.id) {
    const request = pending.get(event.id);
    pending.delete(event.id);
    if (event.error) request?.reject(new Error(JSON.stringify(event.error)));
    else request?.resolve(event.result ?? {});
  } else if (event.method === "Debugger.paused")
    void onPaused(event.params).catch((error) => {
      console.error(error);
      process.exit(1);
    });
});
await protocol.call("Debugger.enable");
await configure();
await protocol.call("Runtime.runIfWaitingForDebugger");
setInterval(() => {
  void fetch("http://127.0.0.1:8000/status", {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(500),
  })
    .then((response) => {
      initialized = response.ok;
    })
    .catch(() => {
      initialized = false;
    });
}, 250).unref();
