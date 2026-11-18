import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * PEG — Minha Escola saves.
 * Isolated from the official PEG progression tables: no XP/coin integration.
 * One row per (playerKey, slot). `data` stores the versioned game payload.
 */
export const schoolSaves = pgTable(
  "school_saves",
  {
    id: serial("id").primaryKey(),
    playerKey: varchar("player_key", { length: 64 }).notNull(),
    slot: varchar("slot", { length: 24 }).notNull().default("main"),
    version: integer("version").notNull().default(1),
    schoolName: text("school_name").notNull().default("Escola PEG"),
    data: jsonb("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("school_saves_player_slot_uq").on(table.playerKey, table.slot)],
);

/**
 * Server-issued rewarded-ad sessions. The claim is idempotent (claimedAt + unique session)
 * so a replayed browser request cannot grant the same construction boost twice.
 */
export const schoolAdSessions = pgTable(
  "school_ad_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerKey: varchar("player_key", { length: 64 }).notNull(),
    reward: varchar("reward", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("issued"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (table) => [index("school_ad_sessions_player_idx").on(table.playerKey, table.createdAt)],
);
