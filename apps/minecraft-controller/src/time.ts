import { setTimeout } from "node:timers/promises";

export interface Clock {
  now(): Date;
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
}

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: async (milliseconds, signal) => {
    await setTimeout(milliseconds, undefined, signal ? { signal } : {});
  },
};
