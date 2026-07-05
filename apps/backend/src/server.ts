// apps/backend/src/server.ts

import "dotenv/config";
import { createApp } from "./app.js";
import { env } from "./config/env.js";

const port = Number(env.BACKEND_PORT);

const app = createApp();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
