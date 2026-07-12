// apps/backend/src/errors/meta.ts

import { authErrorMeta } from "@/features/auth/auth.error-meta.js";
import { invitationErrorMeta } from "@/features/invitations/invitations.error-meta.js";
import { minecraftErrorMeta } from "@/features/minecraft/minecraft.error-meta.js";
import { sessionErrorMeta } from "@/features/sessions/sessions.error-meta.js";
import { userErrorMeta } from "@/features/users/users.error-meta.js";
import type { CommonErrorCode } from "@minecraft-server/shared/common";
import type { ErrorMeta } from "./meta-types.js";

const commonErrorMeta = {
  INTERNAL: { message: "Something went wrong." },
  SERVICE_UNAVAILABLE: { message: "The service is temporarily unavailable." },
  VALIDATION_FAILED: { message: "Validation failed." },
} as const satisfies ErrorMeta<CommonErrorCode>;

export const errorMeta = {
  ...commonErrorMeta,
  ...authErrorMeta,
  ...invitationErrorMeta,
  ...minecraftErrorMeta,
  ...sessionErrorMeta,
  ...userErrorMeta,
} as const satisfies ErrorMeta;
