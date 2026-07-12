// apps/backend/src/openapi/openapi.document.ts

// Feature modules register their operations on the shared registry as an
// import side effect; they must be imported before the document is generated.
import "@/features/auth/auth.openapi.js";
import "@/features/invitations/invitations.openapi.js";
import "@/features/minecraft/players/minecraft-players.openapi.js";
import "@/features/minecraft/server/minecraft-server.openapi.js";
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
        "Admin API for a private, invite-only Minecraft server. " +
        "Errors are returned as JSON: { kind, code, message, issues? }.",
    },
    servers: [{ url: "/api" }],
  });
}
