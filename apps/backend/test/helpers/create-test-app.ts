// apps/backend/test/helpers/create-test-app.ts

import { createApp } from "@/app.js";
import { db } from "@/infrastructure/db/index.js";
import type { AppDeps } from "@/routes/index.js";
import { FakeGoogleOauthClient } from "@test/fakes/fake-google-oauth.client.js";
import { FakeMojangClient } from "@test/fakes/fake-mojang.client.js";
import { FakeProcessClient } from "@test/fakes/fake-process.client.js";
import { FakeRconClient } from "@test/fakes/fake-rcon.client.js";

export interface TestApp {
  readonly app: ReturnType<typeof createApp>;
  readonly googleOauthClient: FakeGoogleOauthClient;
  readonly mojangClient: FakeMojangClient;
  readonly rconClient: FakeRconClient;
  readonly processClient: FakeProcessClient;
}

// The full express app wired against this worker's test database, with fakes
// at every external boundary. Returns the fakes so tests can arrange and
// assert on them.
export function createTestApp(overrides: Partial<AppDeps> = {}): TestApp {
  const googleOauthClient = new FakeGoogleOauthClient();
  const mojangClient = new FakeMojangClient();
  const rconClient = new FakeRconClient();
  const processClient = new FakeProcessClient();

  const app = createApp({
    db,
    googleOauthClient,
    mojangClient,
    rconClient,
    processClient,
    ...overrides,
  });

  return { app, googleOauthClient, mojangClient, rconClient, processClient };
}
