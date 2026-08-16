// apps/frontend/src/features/minecraft/server/console/noise.ts

/**
 * Console lines that carry no information for a human watching the panel.
 *
 * These are self-inflicted: the panel polls online status over RCON, and the
 * outbox whitelists over RCON, and Minecraft logs a thread start and a thread
 * shutdown for every one of those round-trips. What reaches the console is a
 * pair of lines on a fixed cadence that says nothing about the server — it
 * reports that the dashboard is doing its job.
 *
 * Patterns stay narrow on purpose: they match the routine open/close churn and
 * nothing else, so an RCON line that reports an actual problem still shows up.
 */
const NOISE_PATTERNS: readonly RegExp[] = [
  // "[02:33:44 INFO]: Thread RCON Client /172.20.0.5 started"
  // "[02:33:29 INFO]: Thread RCON Client /172.20.0.5 shutting down"
  /\bThread RCON Client \S+ (?:started|shutting down)$/,
  // "[02:33:44 INFO]: Rcon connection from: /172.20.0.5"
  /\bRcon connection from: \S+$/,
];

export function isNoise(line: string): boolean {
  const trimmed = line.trim();

  return NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}
