import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach } from "vitest";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
export async function installationFixture() {
  const root = await mkdtemp(join(tmpdir(), "installation-test-")),
    data = join(root, "minecraft");
  roots.push(root);
  await mkdir(data);
  await writeFile(join(data, "server.properties"), "level-name=world\n");
  await writeFile(join(data, ".ftb-installed"), "130=100440\n");
  await writeFile(
    join(data, ".manifest.json"),
    JSON.stringify({
      id: 130,
      versionId: 100440,
      modPackTargets: { mcVersion: "1.21.1", modLoader: { name: "neoforge", version: "21.1.243" } },
    }),
  );
  return {
    root,
    data,
    env: { TYPE: "FTBA", LEVEL: "world", FTB_MODPACK_ID: "130", FTB_MODPACK_VERSION_ID: "100440" },
  };
}
