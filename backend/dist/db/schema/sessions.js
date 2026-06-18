// backend/src/db/schema/sessions.ts
import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp, unique, uuid, } from "drizzle-orm/pg-core";
import { users } from "./users.js";
export const sessions = pgTable("sessions", {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    expiresAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    userId: uuid("user_id").notNull(),
}, (table) => [
    check("sessions_token_hash_length_check", sql `charLength(${table.tokenHash}) = 64`),
    unique("sessions_token_hash_unique").on(table.tokenHash),
    foreignKey({
        name: "sessions_user_id_fk",
        columns: [table.userId],
        foreignColumns: [users.id],
    }).onDelete("cascade"),
]);
//# sourceMappingURL=sessions.js.map