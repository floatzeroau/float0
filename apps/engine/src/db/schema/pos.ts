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
import { organizations } from './core';

// ── Enums ──────────────────────────────────────────────

export const orderStatusEnum = pgEnum('order_status', [
  'draft',
  'open',
  'submitted',
  'in_progress',
  'ready',
  'completed',
  'voided',
  'cancelled',
  'refunded',
]);

export const orderTypeEnum = pgEnum('order_type', ['dine_in', 'takeaway', 'delivery']);

export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'card',
  'mobile',
  'voucher',
  'split',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'completed',
  'failed',
  'refunded',
]);

export const shiftStatusEnum = pgEnum('shift_status', ['open', 'closed', 'reconciled']);

export const cashMovementDirectionEnum = pgEnum('cash_movement_direction', ['in', 'out']);

export const selectionTypeEnum = pgEnum('selection_type', ['single', 'multiple']);

export const conflictResolutionEnum = pgEnum('conflict_resolution', ['server_wins', 'device_wins']);

// ── Sync Conflicts ────────────────────────────────────

export const syncConflicts = pgTable(
  'sync_conflicts',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    entityType: varchar({ length: 100 }).notNull(),
    entityId: uuid().notNull(),
    localVersion: integer().notNull(),
    serverVersion: integer().notNull(),
    resolution: conflictResolutionEnum().notNull(),
    localData: jsonb().notNull(),
    serverData: jsonb().notNull(),
    terminalId: varchar({ length: 255 }),
    resolvedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sync_conflicts_organization_id_idx').on(t.organizationId),
    index('sync_conflicts_entity_type_entity_id_idx').on(t.entityType, t.entityId),
  ],
);

// ── Categories ─────────────────────────────────────────

export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    name: varchar({ length: 255 }).notNull(),
    colour: varchar({ length: 50 }),
    icon: varchar({ length: 100 }),
    sortOrder: integer().notNull().default(0),
    parentId: uuid(),
    _version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('categories_organization_id_idx').on(t.organizationId),
    index('categories_updated_at_idx').on(t.updatedAt),
  ],
);

// ── Products ───────────────────────────────────────────

export const products = pgTable(
  'products',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    name: varchar({ length: 255 }).notNull(),
    description: text(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    basePrice: doublePrecision().notNull(),
    sku: varchar({ length: 100 }),
    barcode: varchar({ length: 255 }),
    imageUrl: text(),
    isAvailable: boolean().notNull().default(true),
    isGstFree: boolean().notNull().default(false),
    allowAsPack: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    _version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('products_organization_id_idx').on(t.organizationId),
    index('products_updated_at_idx').on(t.updatedAt),
  ],
);

// ── Modifier Groups ───────────────────────────────────

export const modifierGroups = pgTable(
  'modifier_groups',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    name: varchar({ length: 255 }).notNull(),
    displayName: varchar({ length: 255 }),
    selectionType: selectionTypeEnum().notNull().default('single'),
    minSelections: integer().notNull().default(0),
    maxSelections: integer().notNull().default(1),
    sortOrder: integer().notNull().default(0),
    _version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('modifier_groups_organization_id_idx').on(t.organizationId),
    index('modifier_groups_updated_at_idx').on(t.updatedAt),
  ],
);

// ── Modifiers ──────────────────────────────────────────

export const modifiers = pgTable(
  'modifiers',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    name: varchar({ length: 255 }).notNull(),
    modifierGroupId: uuid()
      .notNull()
      .references(() => modifierGroups.id),
    priceAdjustment: doublePrecision().notNull().default(0),
    isDefault: boolean().notNull().default(false),
    isAvailable: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    _version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('modifiers_organization_id_idx').on(t.organizationId),
    index('modifiers_updated_at_idx').on(t.updatedAt),
  ],
);

// ── Product ↔ Modifier Group (join table) ──────────────

export const productModifierGroups = pgTable(
  'product_modifier_groups',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    modifierGroupId: uuid()
      .notNull()
      .references(() => modifierGroups.id),
    sortOrder: integer().notNull().default(0),
    _version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('product_modifier_groups_organization_id_idx').on(t.organizationId),
    index('product_modifier_groups_updated_at_idx').on(t.updatedAt),
  ],
);

// ── Customers ──────────────────────────────────────────

export const customers = pgTable(
  'customers',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    firstName: varchar({ length: 100 }).notNull(),
    lastName: varchar({ length: 100 }).notNull(),
    email: varchar({ length: 255 }),
    phone: varchar({ length: 50 }),
    passwordHash: text(),
    emailVerified: boolean().notNull().default(false),
    lastLoginAt: timestamp({ withTimezone: true }),
    loyaltyTier: varchar({ length: 50 }),
    loyaltyBalance: doublePrecision().notNull().default(0),
    _version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('customers_organization_id_idx').on(t.organizationId),
    index('customers_updated_at_idx').on(t.updatedAt),
    unique('customers_org_email_unique').on(t.organizationId, t.email),
  ],
);

// ── Customer Refresh Tokens ──────────────────────────

export const customerRefreshTokens = pgTable(
  'customer_refresh_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    tokenHash: varchar({ length: 255 }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('customer_refresh_tokens_customer_id_idx').on(t.customerId)],
);

// ── Pack Status Enum ─────────────────────────────────

export const packStatusEnum = pgEnum('pack_status', ['active', 'expired', 'consumed', 'refunded']);

export const packTransactionTypeEnum = pgEnum('pack_transaction_type', [
  'purchase',
  'serve',
  'refund',
  'admin_adjust',
]);

// ── Packs ────────────────────────────────────────────

export const packs = pgTable(
  'packs',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    productSnapshot: jsonb().notNull(),
    totalQuantity: integer().notNull(),
    remainingQuantity: integer().notNull(),
    pricePaid: doublePrecision().notNull(),
    unitValue: doublePrecision().notNull(),
    expiryDate: timestamp({ withTimezone: true }),
    status: packStatusEnum().notNull().default('active'),
    sourceOrderId: uuid().references(() => orders.id),
    purchasedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    _version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('packs_organization_id_idx').on(t.organizationId),
    index('packs_customer_id_idx').on(t.customerId),
    index('packs_status_idx').on(t.status),
  ],
);

// ── Pack Serve Records ──────────────────────────────

export const packServeRecords = pgTable(
  'pack_serve_records',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    packId: uuid()
      .notNull()
      .references(() => packs.id),
    productSnapshot: jsonb(),
    quantityServed: integer().notNull().default(1),
    servedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    baristaId: uuid(),
    terminalId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pack_serve_records_pack_id_idx').on(t.packId),
    index('pack_serve_records_organization_id_idx').on(t.organizationId),
  ],
);

// ── Pack Transactions (audit ledger) ─────────────────

export const packTransactions = pgTable(
  'pack_transactions',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    packId: uuid()
      .notNull()
      .references(() => packs.id),
    type: packTransactionTypeEnum().notNull(),
    quantity: integer().notNull(),
    amount: doublePrecision(),
    referenceId: uuid(),
    staffId: uuid(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pack_transactions_pack_id_idx').on(t.packId),
    index('pack_transactions_organization_id_idx').on(t.organizationId),
  ],
);

// ── Orders ─────────────────────────────────────────────

export const orders = pgTable(
  'orders',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    orderNumber: varchar({ length: 50 }).notNull(),
    orderType: orderTypeEnum().notNull(),
    status: orderStatusEnum().notNull().default('draft'),
    tableNumber: varchar({ length: 20 }),
    customerId: uuid().references(() => customers.id),
    staffId: uuid().notNull(),
    terminalId: varchar({ length: 255 }).notNull(),
    subtotal: doublePrecision().notNull().default(0),
    gst: doublePrecision().notNull().default(0),
    total: doublePrecision().notNull().default(0),
    discountAmount: doublePrecision().notNull().default(0),
    discountType: varchar({ length: 50 }),
    discountValue: doublePrecision(),
    discountReason: text(),
    notes: text(),
    heldAt: timestamp({ withTimezone: true }),
    receiptJson: text(),
    _version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('orders_organization_id_idx').on(t.organizationId),
    index('orders_updated_at_idx').on(t.updatedAt),
  ],
);

// ── Order Items ────────────────────────────────────────

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    quantity: integer().notNull().default(1),
    unitPrice: doublePrecision().notNull(),
    modifiersJson: jsonb(),
    lineTotal: doublePrecision().notNull(),
    discountAmount: doublePrecision().notNull().default(0),
    discountType: varchar({ length: 50 }),
    discountValue: doublePrecision(),
    discountReason: text(),
    notes: text(),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    overridePrice: doublePrecision(),
    overrideReason: text(),
    _version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('order_items_organization_id_idx').on(t.organizationId),
    index('order_items_updated_at_idx').on(t.updatedAt),
  ],
);

// ── Payments ───────────────────────────────────────────

export const payments = pgTable(
  'payments',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    method: paymentMethodEnum().notNull(),
    amount: doublePrecision().notNull(),
    tipAmount: doublePrecision().notNull().default(0),
    tenderedAmount: doublePrecision(),
    changeGiven: doublePrecision(),
    roundingAmount: doublePrecision(),
    cardType: varchar({ length: 50 }),
    lastFour: varchar({ length: 4 }),
    reference: varchar({ length: 255 }),
    status: paymentStatusEnum().notNull().default('pending'),
    _version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('payments_organization_id_idx').on(t.organizationId),
    index('payments_updated_at_idx').on(t.updatedAt),
  ],
);

// ── Shifts ─────────────────────────────────────────────

export const shifts = pgTable(
  'shifts',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    staffId: uuid().notNull(),
    terminalId: varchar({ length: 255 }).notNull(),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp({ withTimezone: true }),
    openingFloat: doublePrecision().notNull().default(0),
    closingFloat: doublePrecision(),
    expectedCash: doublePrecision(),
    actualCash: doublePrecision(),
    variance: doublePrecision(),
    varianceNotes: text(),
    status: shiftStatusEnum().notNull().default('open'),
    _version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('shifts_organization_id_idx').on(t.organizationId),
    index('shifts_updated_at_idx').on(t.updatedAt),
  ],
);

// ── Cash Movements ───────────────────────────────────

export const cashMovements = pgTable(
  'cash_movements',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    shiftId: uuid()
      .notNull()
      .references(() => shifts.id),
    direction: cashMovementDirectionEnum().notNull(),
    amount: doublePrecision().notNull(),
    reason: varchar({ length: 255 }).notNull(),
    staffId: uuid().notNull(),
    managerApproverId: uuid(),
    _version: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('cash_movements_organization_id_idx').on(t.organizationId),
    index('cash_movements_shift_id_idx').on(t.shiftId),
    index('cash_movements_updated_at_idx').on(t.updatedAt),
  ],
);
