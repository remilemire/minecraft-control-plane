// backend/src/app.ts
import express from "express";
import { router } from "./routes/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { env } from "./config/env.js";
export function createApp() {
    const app = express();
    app.use(express.json());
    app.use("/api", router);
    app.use(errorHandler);
    app.set("trust proxy", env.DEBUG ? false : 1);
    return app;
}
//# sourceMappingURL=app.js.map