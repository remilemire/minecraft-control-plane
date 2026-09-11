// apps/backend/src/openapi/openapi.document.ts

// Feature modules register their operations on the shared registry as an
// import side effect; they must be imported before the document is generated.
import "@/features/auth/auth.openapi.js";
import "@/features/minecraft/profiles/profiles.openapi.js";
import "@/features/minecraft/server/server.openapi.js";
import "@/features/minecraft/backups/backups.openapi.js";
import "@/features/users/users.openapi.js";

import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { openApiRegistry } from "./openapi.registry.js";

export function createOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(openApiRegistry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Minecraft Server API",
      version: "1.0.0",
      description:
        "API for a private Minecraft server whose owner provisions the users. " +
        "Errors are returned as JSON: { kind, code, message, issues? }.",
    },
    servers: [{ url: "/api" }],
  });
}
