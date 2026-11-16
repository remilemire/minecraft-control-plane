import type { z } from "zod";
import { snapshot } from "@/immutable.js";
import { ControllerError } from "@/errors.js";
import type {
  RegisteredTask,
  TaskContext,
  RawTaskContext,
  OperationRecord,
  TaskFailureContext,
} from "./contracts.js";
import type { Immutable } from "@/immutable.js";

export function validateTaskRecord(
  tasks: ReadonlyMap<string, RegisteredTask>,
  record: Immutable<OperationRecord>,
): void {
  if (record.historyOnly) {
    if (
      record.kind !== "migration" ||
      ![0, 1].includes(record.taskVersion) ||
      !record.cleanupComplete ||
      !["succeeded", "failed"].includes(record.status)
    )
      throw new Error("An unsupported historical operation needs inspection.");
    return;
  }
  const task = tasks.get(record.kind);
  if (!task || task.version !== record.taskVersion)
    throw new ControllerError(
      "BACKUP_RECOVERY_REQUIRED",
      "The journal contains an unknown task/version. Inspect it before starting Minecraft.",
    );
  task.validate(record);
}

interface TaskHandlers<Request, State> {
  kind: string;
  version: number;
  request: z.ZodType<Request>;
  state: z.ZodType<State>;
  initial(request: Request): State;
  result?(request: Request): Record<string, unknown>;
  canBoot(state: State): boolean;
  prepare?(context: TaskContext<Request, State>): Promise<void>;
  apply(context: TaskContext<Request, State>): Promise<void>;
  verify?(context: TaskContext<Request, State>): Promise<void>;
  recover(context: TaskContext<Request, State>): Promise<void>;
  hold?(context: TaskFailureContext<State>): Promise<void>;
  cleanup?(context: TaskContext<Request, State>): Promise<void>;
}
type TaskDefinition<Request, State> = TaskHandlers<Request, State> &
  (
    | {
        destructive: true;
        safetyBackup(context: TaskContext<Request, State>): Promise<void>;
        verifiedSafety(state: State): boolean;
      }
    | { destructive?: false; safetyBackup?: never; verifiedSafety?: never }
  );

/** Registration is a production extension point; handlers never receive raw journal references. */
export function defineTask<Request, State>(
  definition: TaskDefinition<Request, State>,
): RegisteredTask {
  const state = (record: Pick<OperationRecord, "data">) => definition.state.parse(record.data);
  const context = (raw: RawTaskContext): TaskContext<Request, State> => ({
    id: raw.id,
    interrupted: raw.interrupted,
    request: snapshot(definition.request.parse(raw.record().request)),
    state: () => snapshot(state(raw.record())),
    outcome: () => {
      const status = raw.record().status;
      return status === "succeeded" || status === "failed" ? status : null;
    },
    assertActive: () => raw.assertActive(),
    step: async (name, next, options) => {
      let parsed: State;
      try {
        parsed = definition.state.parse(next);
      } catch (cause) {
        throw new ControllerError(
          "BACKUP_RECOVERY_REQUIRED",
          "A task produced an invalid checkpoint. Startup remains blocked.",
          { cause },
        );
      }
      await raw.step(name, parsed, options);
    },
    boot: (id, action) => raw.boot(id, action),
  });
  return {
    kind: definition.kind,
    version: definition.version,
    prepare(input) {
      const request = definition.request.parse(input);
      return {
        request,
        data: definition.state.parse(definition.initial(request)),
        result: definition.result?.(request) ?? {},
      };
    },
    validate(record) {
      if (record.kind !== definition.kind || record.taskVersion !== definition.version)
        throw new ControllerError(
          "BACKUP_RECOVERY_REQUIRED",
          "The journal uses an unsupported task version. Inspect it before starting Minecraft.",
        );
      definition.request.parse(record.request);
      const current = state(record);
      if (
        (record.status === "succeeded" || record.status === "failed") &&
        !definition.canBoot(current)
      )
        throw new ControllerError(
          "BACKUP_RECOVERY_REQUIRED",
          "A completed task has unsafe live-data checkpoints. Inspect the journal.",
        );
      if (
        record.status === "succeeded" &&
        definition.destructive &&
        !definition.verifiedSafety(current)
      )
        throw new ControllerError(
          "BACKUP_RECOVERY_REQUIRED",
          "A completed destructive task has no safety proof. Inspect the journal.",
        );
    },
    canBoot: (record) => definition.canBoot(state(record)),
    async run(raw) {
      const task = context(raw);
      await definition.prepare?.(task);
      if (definition.destructive) {
        await definition.safetyBackup(task);
        if (!definition.verifiedSafety(state(raw.record())))
          throw new ControllerError(
            "BACKUP_RECOVERY_REQUIRED",
            "A destructive task has no verified safety backup.",
          );
        await task.step("safety-ready", task.state());
      }
      await definition.apply(task);
      await definition.verify?.(task);
    },
    recover: (raw) => definition.recover(context(raw)),
    hold: async (raw) => {
      await definition.hold?.({
        id: raw.id,
        state: () => snapshot(state(raw.record())),
        assertCurrent: () => raw.assertCurrent(),
      });
    },
    cleanup: async (raw) => {
      await definition.cleanup?.(context(raw));
    },
  };
}
