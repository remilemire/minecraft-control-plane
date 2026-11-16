import type {
  MinecraftConsoleLogEvent,
  MinecraftServerStatus,
} from "@minecraft-control-plane/shared/minecraft";
import { z } from "zod";
export const restartPolicySchema = z.object({
  Name: z.string(),
  MaximumRetryCount: z.number().int().nonnegative().optional(),
});
export type RestartPolicy = z.infer<typeof restartPolicySchema>;
export interface RuntimeState {
  containerId: string;
  hostname: string;
  running: boolean;
  env: Record<string, string>;
  restartPolicy: RestartPolicy;
}
export interface MinecraftRuntime {
  inspect(): Promise<RuntimeState>;
  execute(command: string, timeoutSeconds?: number): Promise<string>;
  stop(): Promise<void>;
  start(): Promise<void>;
  setRestartPolicy(policy: RestartPolicy): Promise<void>;
  waitReady(): Promise<void>;
}
export interface MinecraftReader {
  getStatus(): Promise<MinecraftServerStatus>;
  openLogStream(signal: AbortSignal): Promise<AsyncIterable<MinecraftConsoleLogEvent>>;
  closeLogStreams(): void;
}
