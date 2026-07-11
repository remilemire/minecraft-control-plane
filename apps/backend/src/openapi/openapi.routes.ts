// apps/backend/src/openapi/openapi.routes.ts

import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { createOpenApiDocument } from "./openapi.document.js";

export function createOpenApiRoutes(): Router {
  const router = Router();
  const document = createOpenApiDocument();

  router.get("/openapi.json", (_req, res) => {
    res.json(document);
  });

  router.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(document, { customSiteTitle: "Minecraft Server API" }),
  );

  return router;
}
