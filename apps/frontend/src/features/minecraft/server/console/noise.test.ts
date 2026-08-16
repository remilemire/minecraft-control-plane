// apps/frontend/src/features/minecraft/server/console/noise.test.ts

import { describe, expect, it } from "vitest";
import { isNoise } from "./noise";

describe("isNoise", () => {
  it("drops the RCON thread churn our own polling causes", () => {
    expect(isNoise("[02:33:29 INFO]: Thread RCON Client /172.20.0.5 shutting down")).toBe(true);
    expect(isNoise("[02:33:44 INFO]: Thread RCON Client /172.20.0.5 started")).toBe(true);
    expect(isNoise("[02:33:44 INFO]: Rcon connection from: /172.20.0.5")).toBe(true);
  });

  it("drops them with the trailing whitespace raw output carries", () => {
    expect(isNoise("[02:33:44 INFO]: Thread RCON Client /172.20.0.5 started\r\n")).toBe(true);
  });

  it("keeps ordinary server output", () => {
    expect(isNoise("[02:33:44 INFO]: Steve joined the game")).toBe(false);
    expect(isNoise('[02:33:44 INFO]: Done (12.345s)! For help, type "help"')).toBe(false);
    expect(isNoise("[02:33:44 INFO]: <Steve> hello")).toBe(false);
    expect(isNoise("")).toBe(false);
  });

  it("keeps RCON lines that report an actual problem", () => {
    // The filter is for routine open/close churn only — anything that would
    // tell you RCON is broken has to survive it.
    expect(isNoise("[02:33:44 WARN]: Thread RCON Client /172.20.0.5 failed to authenticate")).toBe(
      false,
    );
    expect(isNoise("[02:33:44 INFO]: Rcon connection from: /172.20.0.5 rejected")).toBe(false);
    expect(isNoise("[02:33:44 ERROR]: Unable to start RCON listener")).toBe(false);
  });
});
