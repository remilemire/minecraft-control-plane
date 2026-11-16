import type {
  MinecraftConsoleLogEvent,
  MinecraftServerStatusResponse,
} from "@minecraft-control-plane/shared/minecraft";
import { ControllerError, publicFailure } from "@/errors.js";
import type { Immutable } from "@/immutable.js";
import type { MinecraftRuntime, MinecraftReader } from "@/runtime/service.js";
import type { Admission, ExecutionLease } from "@/maintenance/service.js";
import { z } from "zod";
import { restartPolicySchema } from "@/runtime/service.js";
import type { TaskContext } from "@/maintenance/service.js";
export const serverCheckpointSchema = z.object({
  containerId: z.string().nullable().default(null),
  wasRunning: z.boolean().default(false),
  restartPolicy: restartPolicySchema.nullable().default(null),
  stoppedByOperation: z.boolean().default(false),
  savingDisabled: z.boolean().default(false),
});
export type ServerCheckpoint = z.infer<typeof serverCheckpointSchema>;

export interface ServerApi {
  power(kind: "start" | "stop" | "restart"): Promise<void>;
  execute(command: string): Promise<string>;
  getStatus(): Promise<MinecraftServerStatusResponse>;
  openLogStream(signal: AbortSignal): Promise<AsyncIterable<MinecraftConsoleLogEvent>>;
  closeLogStreams(): void;
}
export interface ServerSession extends ExecutionLease {
  read(): Immutable<ServerCheckpoint>;
  record(patch: Partial<ServerCheckpoint>, phase?: string): Promise<void>;
  boot<T>(containerId: string, action: () => Promise<T>): Promise<T>;
}
export interface ServerOperations {
  capture(session: ServerSession): Promise<void>;
  identity(session: ServerSession): Promise<void>;
  assertStopped(session: ServerSession): Promise<void>;
  suspend(session: ServerSession): Promise<void>;
  resume(session: ServerSession): Promise<void>;
  start(session: ServerSession): Promise<void>;
  finish(session: ServerSession): Promise<void>;
  players(): Promise<number>;
  running(): Promise<boolean>;
  saving(session: ServerSession, enabled: boolean): Promise<void>;
  flush(session: ServerSession): Promise<void>;
  announce(session: ServerSession, message: string): Promise<void>;
  hold(state: Immutable<ServerCheckpoint>, assertCurrent: () => void, stop: boolean): Promise<void>;
}

export class ServerService implements ServerApi {
  public constructor(
    private readonly runtime: MinecraftRuntime & MinecraftReader,
    private readonly admission: Admission,
  ) {}
  public async power(kind: "start" | "stop" | "restart"): Promise<void> {
    const id = await this.admission.submit(kind, {});
    await this.admission.wait(id);
    const op = this.admission.operation(id);
    if (op.status !== "succeeded")
      throw new ControllerError(
        op.status === "recoveryRequired" ? "BACKUP_RECOVERY_REQUIRED" : "BACKUP_CONTROLLER_ERROR",
        op.error ?? "The power operation failed.",
      );
  }
  public execute(command: string): Promise<string> {
    return this.admission.exclusive(() => this.runtime.execute(command));
  }
  public async getStatus(): Promise<MinecraftServerStatusResponse> {
    return {
      status: await this.runtime.getStatus(),
      maintenance: this.admission.activeOperation(),
    };
  }
  public openLogStream(signal: AbortSignal) {
    return this.runtime.openLogStream(signal);
  }
  public closeLogStreams(): void {
    this.runtime.closeLogStreams();
  }
}

/** Trusted task capabilities. Never returned by the public server API. */
export function createServerOperations(runtime: MinecraftRuntime): ServerOperations {
  const identity = async (session: ServerSession) => {
    session.assertActive();
    if (session.read().containerId !== (await runtime.inspect()).containerId)
      throw new ControllerError(
        "BACKUP_RECOVERY_REQUIRED",
        "The managed container changed. Keep Minecraft stopped and inspect the journal.",
      );
  };
  const assertStopped = async (session: ServerSession) => {
    await identity(session);
    if ((await runtime.inspect()).running)
      throw new ControllerError(
        "BACKUP_RECOVERY_REQUIRED",
        "Minecraft started during maintenance. Inspect recovery before continuing.",
      );
  };
  const finish = async (session: ServerSession) => {
    await identity(session);
    const policy = session.read().restartPolicy;
    if (policy && session.read().stoppedByOperation)
      await runtime.setRestartPolicy(structuredClone(policy));
    await session.record({ stoppedByOperation: false });
  };
  return {
    identity,
    assertStopped,
    async capture(session) {
      session.assertActive();
      const current = await runtime.inspect();
      await session.record({
        containerId: current.containerId,
        wasRunning: current.running,
        restartPolicy: current.restartPolicy,
      });
    },
    async suspend(session) {
      await identity(session);
      const current = await runtime.inspect();
      await session.record(
        {
          restartPolicy: session.read().restartPolicy ?? current.restartPolicy,
          stoppedByOperation: true,
        },
        "Stopping Minecraft gracefully",
      );
      await runtime.setRestartPolicy({ Name: "no" });
      try {
        await runtime.stop();
      } catch (cause) {
        throw new ControllerError(
          "BACKUP_RECOVERY_REQUIRED",
          `${publicFailure(cause)} The stop outcome needs inspection.`,
          { cause },
        );
      }
      await assertStopped(session);
    },
    async resume(session) {
      await identity(session);
      const state = session.read();
      if (state.wasRunning && state.stoppedByOperation) {
        await session.record({}, "Starting Minecraft and checking readiness");
        await session.boot(state.containerId!, async () => {
          if (!(await runtime.inspect()).running) await runtime.start();
          await runtime.waitReady();
        });
      }
      if (!state.wasRunning && (await runtime.inspect()).running) await runtime.stop();
      await finish(session);
    },
    async start(session) {
      await identity(session);
      await session.record({}, "Starting Minecraft and checking readiness");
      await session.boot(session.read().containerId!, async () => {
        await runtime.start();
        await runtime.waitReady();
      });
      await finish(session);
    },
    finish,
    players: () => runtime.players(),
    running: async () => (await runtime.inspect()).running,
    async saving(session, enabled) {
      await identity(session);
      if (!enabled) await session.record({ savingDisabled: true });
      if ((await runtime.inspect()).running) await runtime.saving(enabled);
      if (enabled) await session.record({ savingDisabled: false });
    },
    async flush(session) {
      await identity(session);
      await runtime.flush();
    },
    async announce(session, message) {
      await identity(session);
      await runtime.announce(message);
    },
    async hold(state, assertCurrent, stop) {
      assertCurrent();
      const current = await runtime.inspect();
      if (state.containerId !== current.containerId)
        throw new ControllerError(
          "BACKUP_RECOVERY_REQUIRED",
          "The container changed while recovery was held.",
        );
      if (stop) {
        await runtime.setRestartPolicy({ Name: "no" });
        await runtime.stop();
      } else if (state.savingDisabled && current.running) await runtime.saving(true);
    },
  };
}

/** The task retains ownership of its checkpoint; server operations receive only their durable port. */
export function serverSession<Request, State extends ServerCheckpoint>(
  context: TaskContext<Request, State>,
): ServerSession {
  return {
    id: context.id,
    assertActive: () => context.assertActive(),
    read: () => context.state(),
    record: (patch, phase) =>
      context.step(
        phase ?? "server-checkpoint",
        { ...context.state(), ...patch },
        phase ? { phase } : {},
      ),
    boot: (container, action) => context.boot(container, action),
  };
}
