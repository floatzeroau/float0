import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ── Enums ──────────────────────────────────────────────

export const orgMembershipRoleEnum = pgEnum('org_membership_role', [
  'owner',
  'admin',
  'manager',
  'staff',
]);

export const eventStatusEnum = pgEnum('event_status', ['pending', 'processed', 'failed']);

// ── Organizations ──────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull(),
  abn: varchar({ length: 11 }),
  address: jsonb(),
  phone: varchar({ length: 50 }),
  email: varchar({ length: 255 }),
  website: varchar({ length: 255 }),
  timezone: varchar({ length: 100 }).notNull().default('Australia/Melbourne'),
  currency: varchar({ length: 10 }).notNull().default('AUD'),
  enabledModules: jsonb().notNull().default([]),
  subscriptionTier: varchar({ length: 50 }),
  gstRate: doublePrecision().notNull().default(10),
  settings: jsonb().notNull().default({}),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ── Users ──────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: varchar({ length: 255 }).notNull().unique(),
  passwordHash: varchar({ length: 255 }).notNull(),
  firstName: varchar({ length: 100 }).notNull(),
  lastName: varchar({ length: 100 }).notNull(),
  phone: varchar({ length: 50 }),
  isActive: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ── Org Memberships ────────────────────────────────────

export const orgMemberships = pgTable(
  'org_memberships',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    role: orgMembershipRoleEnum().notNull(),
    pinHash: varchar({ length: 255 }),
    pinFailedAttempts: integer().notNull().default(0),
    pinLockedUntil: timestamp({ withTimezone: true }),
    permissions: jsonb().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.userId, t.organizationId),
    index('org_memberships_user_id_idx').on(t.userId),
    index('org_memberships_organization_id_idx').on(t.organizationId),
  ],
);

// ── Audit Log ──────────────────────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    action: varchar({ length: 255 }).notNull(),
    entityType: varchar({ length: 100 }).notNull(),
    entityId: uuid(),
    changes: jsonb(),
    ipAddress: varchar({ length: 45 }),
    deviceId: varchar({ length: 255 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_organization_id_idx').on(t.organizationId),
    index('audit_log_user_id_idx').on(t.userId),
  ],
);

// ── Refresh Tokens ───────────────────────────────────────

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    tokenHash: varchar({ length: 255 }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('refresh_tokens_user_id_idx').on(t.userId)],
);

// ── Event Log ──────────────────────────────────────────

export const eventLog = pgTable(
  'event_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    eventName: varchar({ length: 255 }).notNull(),
    payload: jsonb(),
    sourceModule: varchar({ length: 100 }),
    status: eventStatusEnum().notNull().default('pending'),
    retryCount: integer().notNull().default(0),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('event_log_organization_id_idx').on(t.organizationId)],
);
