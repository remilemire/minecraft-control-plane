// apps/backend/src/server.ts

import "dotenv/config";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { db } from "./db/client.js";
import { GoogleOauthClient } from "./features/auth/clients/google-oauth.client.js";
import { MojangClient } from "./features/minecraft/clients/mojang.client.js";
import { ProcessClient } from "./features/minecraft/clients/process.client.js";
import { RconClient } from "./features/minecraft/clients/rcon.client.js";

const port = Number(env.BACKEND_PORT);

const app = createApp({
  db,
  googleOauthClient: new GoogleOauthClient({ clientId: env.GOOGLE_CLIENT_ID }),
  mojangClient: new MojangClient(),
  rconClient: new RconClient({
    host: env.MINECRAFT_RCON_HOST,
    port: env.MINECRAFT_RCON_PORT,
    password: env.MINECRAFT_RCON_PASSWORD,
  }),
  processClient: new ProcessClient({
    composeFile: env.MINECRAFT_COMPOSE_FILE,
    serviceName: env.MINECRAFT_SERVICE_NAME,
  }),
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
