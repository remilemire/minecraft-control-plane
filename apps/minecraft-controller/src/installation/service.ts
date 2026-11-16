import type { ServerVersion, BackupCompatibility } from "@minecraft-control-plane/shared/minecraft";
import type { MinecraftRuntime } from "@/runtime/service.js";
import { readInstallation, compareVersions, type Installation } from "./metadata.js";
export type { Installation } from "./metadata.js";
export interface InstallationReader {
  read(path?: string): Promise<Installation>;
  compare(version: ServerVersion | null, current: Installation): BackupCompatibility;
}
export function createInstallationService(
  dataPath: string,
  runtime: Pick<MinecraftRuntime, "inspect">,
): InstallationReader {
  return Object.freeze({
    read: async (path = dataPath) => readInstallation(path, (await runtime.inspect()).env),
    compare: compareVersions,
  });
}
