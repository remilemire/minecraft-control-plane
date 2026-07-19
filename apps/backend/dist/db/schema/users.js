// apps/backend/src/db/schema/users.ts
import { USERS_CONSTRAINTS } from "../../db/constraints.js";
import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    googleId: text("google_id").notNull().unique(USERS_CONSTRAINTS.GOOGLE_ID_UNIQUE),
    email: text("email").notNull().unique(USERS_CONSTRAINTS.EMAIL_UNIQUE),
    firstName: text("first_name"),
    lastName: text("last_name"),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    check("users_email_length_check", sql `char_length(${table.email}) BETWEEN 1 AND 254`),
    check("users_first_name_length_check", sql `char_length(${table.firstName}) BETWEEN 1 AND 64`),
    check("users_last_name_length_check", sql `char_length(${table.lastName}) BETWEEN 1 AND 64`),
]);
//# sourceMappingURL=users.js.map