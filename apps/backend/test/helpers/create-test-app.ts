// apps/backend/test/helpers/create-test-app.ts

import { createBackend, type Backend } from "@/backend.js";
import { db } from "@/infrastructure/db/index.js";
import type { AppDeps } from "@/routes/index.js";
import { FakeGoogleOauthClient } from "@test/fakes/fake-google-oauth.client.js";
import { FakeMojangClient } from "@test/fakes/fake-mojang.client.js";
import { FakeProcessClient } from "@test/fakes/fake-process.client.js";
import { FakeRconClient } from "@test/fakes/fake-rcon.client.js";
import { FakeBackupsClient } from "@test/fakes/fake-backups.client.js";

export interface TestApp {
  readonly app: Backend["app"];
  // Never start()ed in tests — drive it with `await outboxDispatcher.tick()`.
  readonly outboxDispatcher: Backend["outboxDispatcher"];
  readonly googleOauthClient: FakeGoogleOauthClient;
  readonly mojangClient: FakeMojangClient;
  readonly rconClient: FakeRconClient;
  readonly processClient: FakeProcessClient;
  readonly backupsClient: FakeBackupsClient;
}

// The full express app wired against this worker's test database, with fakes
// at every external boundary. Returns the fakes so tests can arrange and
// assert on them.
export function createTestApp(overrides: Partial<AppDeps> = {}): TestApp {
  const googleOauthClient = new FakeGoogleOauthClient();
  const mojangClient = new FakeMojangClient();
  const rconClient = new FakeRconClient();
  const processClient = new FakeProcessClient();
  const backupsClient = new FakeBackupsClient();

  const { app, outboxDispatcher } = createBackend({
    db,
    googleOauthClient,
    mojangClient,
    rconClient,
    processClient,
    backupsClient,
    ...overrides,
  });

  return {
    app,
    outboxDispatcher,
    googleOauthClient,
    mojangClient,
    rconClient,
    processClient,
    backupsClient,
  };
}
