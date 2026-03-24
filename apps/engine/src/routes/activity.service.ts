import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { auditLog, users } from '../db/schema/core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityEntry {
  id: string;
  type: string;
  description: string;
  staffName: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Action → human-readable description
// ---------------------------------------------------------------------------

const actionDescriptions: Record<string, (entityType: string, changes?: unknown) => string> = {
  'order.complete': () => 'Completed an order',
  'order.create': () => 'Created a new order',
  'order.void': () => 'Voided an order',
  'order.refund': () => 'Processed a refund',
  'payment.create': () => 'Processed a payment',
  'product.create': (_, changes) => {
    const c = changes as { created?: { name?: string } } | null;
    const name = c?.created?.name;
    return name ? `Added product "${name}"` : 'Added a new product';
  },
  'product.update': () => 'Updated a product',
  'product.delete': () => 'Removed a product',
  'category.create': (_, changes) => {
    const c = changes as { created?: { name?: string } } | null;
    const name = c?.created?.name;
    return name ? `Created category "${name}"` : 'Created a new category';
  },
  'category.update': () => 'Updated a category',
  'category.delete': () => 'Removed a category',
  'category.reorder': () => 'Reordered categories',
  'modifier_group.create': () => 'Created a modifier group',
  'modifier_group.update': () => 'Updated a modifier group',
  'modifier_group.delete': () => 'Removed a modifier group',
  'modifier.create': () => 'Added a modifier',
  'modifier.update': () => 'Updated a modifier',
  'modifier.delete': () => 'Removed a modifier',
  'shift.open': () => 'Opened a shift',
  'shift.close': () => 'Closed a shift',
  'cash_movement.create': (_, changes) => {
    const c = changes as { created?: { direction?: string; amount?: number } } | null;
    const dir = c?.created?.direction;
    const amt = c?.created?.amount;
    if (dir && amt) return `Cash ${dir}: $${amt.toFixed(2)}`;
    return 'Recorded a cash movement';
  },
  'no_sale.open': () => 'Opened cash drawer (no sale)',
  'receipt.email': () => 'Emailed a receipt',
};

function describeAction(action: string, entityType: string, changes: unknown): string {
  const fn = actionDescriptions[action];
  if (fn) return fn(entityType, changes);
  // Fallback: convert action to readable text
  const [entity, verb] = action.split('.');
  if (entity && verb) {
    return `${verb.charAt(0).toUpperCase() + verb.slice(1)}d a ${entity.replace(/_/g, ' ')}`;
  }
  return action;
}

function deriveType(action: string): string {
  const prefix = action.split('.')[0];
  switch (prefix) {
    case 'order':
      return 'order';
    case 'payment':
      return 'payment';
    case 'product':
    case 'category':
    case 'modifier_group':
    case 'modifier':
      return 'product';
    case 'shift':
      return 'shift';
    case 'cash_movement':
    case 'no_sale':
      return 'cash';
    case 'receipt':
      return 'receipt';
    default:
      return 'other';
  }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export async function listActivity(orgId: string, limit: number): Promise<ActivityEntry[]> {
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      changes: auditLog.changes,
      createdAt: auditLog.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(auditLog)
    .innerJoin(users, eq(auditLog.userId, users.id))
    .where(eq(auditLog.organizationId, orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    type: deriveType(row.action),
    description: describeAction(row.action, row.entityType, row.changes),
    staffName: `${row.firstName} ${row.lastName}`,
    createdAt: row.createdAt.toISOString(),
  }));
}
