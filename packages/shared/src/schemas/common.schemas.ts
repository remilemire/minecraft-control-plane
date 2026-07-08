// packages/shared/src/schemas/common.schemas.ts

import z from "zod";

export const emailSchema = z.email().toLowerCase().trim();
