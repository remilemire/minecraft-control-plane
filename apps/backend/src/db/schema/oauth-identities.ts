// apps/backend/src/db/schema/oauth-identities.ts

import { OAUTH_IDENTITIES_CONSTRAINTS } from "@/db/constraints.js";
import { foreignKey, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const oauthProviderEnum = pgEnum("oauth_provider", ["google"]);

export const oauthIdentities = pgTable(
  "oauth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id").notNull(),

    provider: oauthProviderEnum("provider").notNull(),
    subject: text("subject").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique(OAUTH_IDENTITIES_CONSTRAINTS.PROVIDER_SUBJECT_UNIQUE).on(table.provider, table.subject),
    foreignKey({
      name: OAUTH_IDENTITIES_CONSTRAINTS.USER_ID_FK,
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("cascade"),
  ],
);

export type OAuthIdentity = typeof oauthIdentities.$inferSelect;
export type NewOAuthIdentity = typeof oauthIdentities.$inferInsert;
