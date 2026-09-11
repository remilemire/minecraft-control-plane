import { z } from "zod";
import {
  backupListResponseSchema,
  backupOperationAcceptedSchema,
  backupRequestSchema,
  backupRestorePreviewSchema,
  backupSchedulesInputSchema,
  backupSchedulesResponseSchema,
  maintenanceOperationSchema,
} from "@minecraft-control-plane/shared/minecraft";
import { openApiRegistry } from "@/openapi/openapi.registry.js";
import {
  baseErrorResponses,
  csrfErrorResponse,
  emptyResponse,
  jsonResponse,
  SESSION_AND_CSRF_SECURITY,
  SESSION_SECURITY,
  unauthenticatedResponse,
  createErrorResponseSchema,
  errorCodesOfKind,
} from "@/openapi/openapi.schemas.js";

const errors = {
  ...baseErrorResponses,
  401: unauthenticatedResponse,
  403: csrfErrorResponse,
  404: jsonResponse(
    "Backup or operation not found.",
    createErrorResponseSchema("NOT_FOUND", errorCodesOfKind("NOT_FOUND")),
  ),
  409: jsonResponse(
    "Maintenance, compatibility, storage or setup conflict.",
    createErrorResponseSchema("CONFLICT", errorCodesOfKind("CONFLICT")),
  ),
};
const routes = [
  {
    method: "get",
    path: "",
    operationId: "listBackups",
    summary: "List backup archives and current maintenance",
    schema: backupListResponseSchema,
  },
  {
    method: "post",
    path: "",
    operationId: "createBackup",
    summary: "Create a manual backup",
    schema: backupOperationAcceptedSchema,
    body: backupRequestSchema,
  },
  {
    method: "get",
    path: "/schedules",
    operationId: "getBackupSchedules",
    summary: "Get enabled schedules, retention and next run times",
    schema: backupSchedulesResponseSchema,
  },
  {
    method: "put",
    path: "/schedules",
    operationId: "updateBackupSchedules",
    summary: "Enable or disable independent backup schedules",
    schema: backupSchedulesResponseSchema,
    body: backupSchedulesInputSchema,
  },
  {
    method: "get",
    path: "/operations/{id}",
    operationId: "getBackupOperation",
    summary: "Get durable operation progress",
    schema: maintenanceOperationSchema,
  },
  {
    method: "get",
    path: "/{id}/restore-preview",
    operationId: "previewBackupRestore",
    summary: "Check version compatibility, players and recovery space",
    schema: backupRestorePreviewSchema,
  },
  {
    method: "post",
    path: "/{id}/restore",
    operationId: "restoreBackup",
    summary: "Restore after confirmation, preserving a safety backup",
    schema: backupOperationAcceptedSchema,
    body: backupRequestSchema,
  },
] as const;
for (const route of routes) {
  openApiRegistry.registerPath({
    method: route.method,
    path: `/minecraft/backups${route.path}`,
    operationId: route.operationId,
    summary: route.summary,
    tags: ["Minecraft Backups"],
    security: route.method === "get" ? SESSION_SECURITY : SESSION_AND_CSRF_SECURITY,
    request: {
      ...(route.path.includes("{id}") ? { params: z.object({ id: z.uuid() }) } : {}),
      ...("body" in route
        ? { body: { required: true, content: { "application/json": { schema: route.body } } } }
        : {}),
    },
    responses: {
      ...errors,
      [route.method === "post" ? 202 : 200]: jsonResponse(route.summary, route.schema),
    },
  });
}
openApiRegistry.registerPath({
  method: "delete",
  path: "/minecraft/backups/{id}",
  operationId: "deleteBackup",
  summary: "Permanently delete a backup after confirmation",
  tags: ["Minecraft Backups"],
  security: SESSION_AND_CSRF_SECURITY,
  request: { params: z.object({ id: z.uuid() }) },
  responses: { ...errors, 204: emptyResponse("Backup deleted.") },
});
