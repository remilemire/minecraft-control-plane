import {
  serverVersionSchema,
  type BackupCompatibility,
  type ServerVersion,
} from "@minecraft-control-plane/shared/minecraft";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { isMissing } from "./errors.js";

export interface Installation {
  version: ServerVersion | null;
  worldName: string;
  pinned: boolean;
  reasons: string[];
}
const ftbManifestSchema = z.object({
  id: z.number(),
  versionId: z.number(),
  modPackTargets: z.object({
    mcVersion: z.string(),
    modLoader: z.object({ name: z.string(), version: z.string() }),
  }),
});
const paperManifestSchema = z.object({
  minecraftVersion: z.string(),
  project: z.literal("paper"),
  build: z.union([z.string(), z.number()]),
  customDownloadUrl: z.string().nullable().optional(),
});
const vanillaManifestSchema = z.object({
  minecraftVersion: z.string(),
  serverEntry: z.string().regex(/^[\w.-]+\.jar$/),
});

export async function readInstallation(
  dataPath: string,
  env: Record<string, string>,
): Promise<Installation> {
  let worldName = env.LEVEL || "world";
  try {
    const properties = await readFile(join(dataPath, "server.properties"), "utf8");
    worldName = /^level-name=(.+)$/m.exec(properties)?.[1]?.trim() || worldName;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  if (!/^[\w .-]+$/.test(worldName) || worldName === "." || worldName === "..") {
    return {
      version: null,
      worldName,
      pinned: false,
      reasons: ["The configured world directory is unsupported."],
    };
  }
  const type = env.TYPE || "VANILLA";
  try {
    let version: ServerVersion;
    let pinned = false;
    if (type === "FTBA") {
      const manifest = ftbManifestSchema.parse(
        JSON.parse(await readFile(join(dataPath, ".manifest.json"), "utf8")),
      );
      const installed = (await readFile(join(dataPath, ".ftb-installed"), "utf8")).trim();
      if (installed !== `${String(manifest.id)}=${String(manifest.versionId)}`)
        throw new Error("FTB installation marker mismatch");
      version = {
        serverType: "FTBA",
        minecraftVersion: manifest.modPackTargets.mcVersion,
        loader: manifest.modPackTargets.modLoader.name,
        loaderVersion: manifest.modPackTargets.modLoader.version,
        modpackId: String(manifest.id),
        modpackVersionId: String(manifest.versionId),
      };
      pinned =
        env.FTB_MODPACK_ID === version.modpackId &&
        env.FTB_MODPACK_VERSION_ID === version.modpackVersionId &&
        env.FTB_FORCE_REINSTALL?.toLowerCase() !== "true";
    } else if (type === "PAPER") {
      const manifest = paperManifestSchema.parse(
        JSON.parse(await readFile(join(dataPath, ".papermc-manifest.json"), "utf8")),
      );
      version = {
        serverType: "PAPER",
        minecraftVersion: manifest.minecraftVersion,
        loader: "paper",
        loaderVersion: String(manifest.build),
        modpackId: null,
        modpackVersionId: null,
      };
      pinned =
        env.VERSION === version.minecraftVersion &&
        env.PAPER_BUILD === version.loaderVersion &&
        !env.PAPER_CUSTOM_JAR &&
        !env.PAPER_DOWNLOAD_URL &&
        !manifest.customDownloadUrl &&
        (!env.PAPER_PROJECT || env.PAPER_PROJECT === "paper");
    } else if (type === "VANILLA") {
      // The server JAR contains its resolved version, independent of a floating VERSION selector.
      const { jarVersion } = await import("./zip.js");
      let manifest: z.infer<typeof vanillaManifestSchema> | null = null;
      try {
        manifest = vanillaManifestSchema.parse(
          JSON.parse(await readFile(join(dataPath, ".vanilla-manifest.json"), "utf8")),
        );
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      const installed = await jarVersion(
        dataPath,
        manifest?.serverEntry ??
          (env.VERSION ? `minecraft_server.${env.VERSION}.jar` : "server.jar"),
      );
      if (manifest && manifest.minecraftVersion !== installed)
        throw new Error("Vanilla installation marker mismatch");
      version = {
        serverType: "VANILLA",
        minecraftVersion: installed,
        loader: null,
        loaderVersion: null,
        modpackId: null,
        modpackVersionId: null,
      };
      pinned = env.VERSION === installed;
    } else {
      return {
        version: null,
        worldName,
        pinned: false,
        reasons: [`Version verification is not supported for server type ${type}.`],
      };
    }
    return {
      version: serverVersionSchema.parse(version),
      worldName,
      pinned,
      reasons: (pinned
        ? []
        : [
            "Pin the deployment's Minecraft/modpack version (and Paper build when applicable) to the installed version before recovery.",
          ]
      ).concat(
        env.LEVEL && env.LEVEL !== worldName
          ? [
              "The deployment's world name does not match the installed server.properties. Align these settings before recovery.",
            ]
          : [],
      ),
    };
  } catch {
    return {
      version: null,
      worldName,
      pinned: false,
      reasons: ["The installed Minecraft/modpack version could not be verified."],
    };
  }
}

export function compareVersions(
  backup: ServerVersion | null,
  current: Installation,
): BackupCompatibility {
  const reasons = [...current.reasons];
  if (backup === null)
    reasons.push("This archive has no verifiable version record; assisted restore is disabled.");
  if (backup !== null && current.version !== null) {
    const labels: Record<keyof ServerVersion, string> = {
      serverType: "Server type",
      minecraftVersion: "Minecraft version",
      loader: "Mod loader",
      loaderVersion: "Loader version",
      modpackId: "Modpack",
      modpackVersionId: "Modpack version",
    };
    for (const key of Object.keys(backup) as (keyof ServerVersion)[]) {
      if (backup[key] !== current.version[key])
        reasons.push(
          `${labels[key]}: backup ${backup[key] ?? "none"}; server ${current.version[key] ?? "none"}.`,
        );
    }
  }
  return {
    compatible:
      reasons.length === 0 && backup !== null && current.version !== null && current.pinned,
    reasons,
  };
}
