// apps/backend/src/features/auth/auth.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type {
  AuthClientErrorCode,
  AuthErrorCode,
  SessionErrorCode,
} from "@minecraft-server/shared/auth";
import { authClientErrorCatalog } from "./clients/clients.error-catalog.js";
import { sessionErrorCatalog } from "./sessions/sessions.error-catalog.js";

const ownErrorCatalog = {
  UNAUTHENTICATED: { message: "Authentication required." },
  NOT_INVITED: { message: "Invite only." },
  ADMIN_REQUIRED: { message: "You do not have permission to perform this action." },
  INVALID_CSRF_TOKEN: { message: "Invalid CSRF token." },
} as const satisfies ErrorCatalog<AuthErrorCode>;

// Aggregates the sub-features' catalogs, so `errors/catalog.ts` sees one entry
// per top-level feature (same shape as minecraft.error-catalog.ts).
export const authErrorCatalog = {
  ...ownErrorCatalog,
  ...authClientErrorCatalog,
  ...sessionErrorCatalog,
} as const satisfies ErrorCatalog<AuthErrorCode | AuthClientErrorCode | SessionErrorCode>;
