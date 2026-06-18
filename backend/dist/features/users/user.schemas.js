// backend/src/features/users/user.schemas.ts
import { emailSchema } from "@/shared/schemas.js";
import z from "zod";
const nameSchema = z.string().min(1).max(64);
export const createUserProfileSchema = z.object({
    firstName: nameSchema,
    lastName: nameSchema,
    email: emailSchema,
});
export const userResponseSchema = z.object({
    id: z.uuid(),
    firstName: nameSchema,
    lstName: nameSchema,
    email: emailSchema,
    isAdmin: z.boolean(),
    createdAt: z.date(),
});
//# sourceMappingURL=user.schemas.js.map