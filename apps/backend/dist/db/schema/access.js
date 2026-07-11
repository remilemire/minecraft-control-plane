// apps/backend/src/db/schema/access.ts
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  inet,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
export const accessKeys = pgTable(
  "access_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    keyHash: text("key_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "access_keys_label_length_check",
      sql`
      char_length(${table.label}) BETWEEN 1 AND 64
    `,
    ),
    check(
      "access_keys_key_hash_length_check",
      sql`
      char_length(${table.keyHash}) = 64
    `,
    ),
    unique("access_keys_key_hash_unique").on(table.keyHash),
  ],
);
export const accessGrants = pgTable(
  "access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ipAddress: inet("ip_address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    accessKeyId: uuid("access_key_id").notNull(),
  },
  (table) => [
    unique("access_grants_access_key_id_ip_address_unique").on(table.accessKeyId, table.ipAddress),
    foreignKey({
      name: "access_grants_access_key_id_fk",
      columns: [table.accessKeyId],
      foreignColumns: [accessKeys.id],
    }).onDelete("cascade"),
  ],
);
//# sourceMappingURL=access.js.map
