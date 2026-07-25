// packages/shared/src/common/schemas.ts

import { z } from "zod";

// Trim and lowercase before validating: the email() check must run on the
// normalized value, otherwise surrounding whitespace fails validation before
// trim() can ever apply.
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
