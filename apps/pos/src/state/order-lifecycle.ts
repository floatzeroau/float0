import { database } from '../db/database';
import type { Order } from '../db/models';

// ---------------------------------------------------------------------------
// Order Status (matches @float0/shared OrderStatus enum values, lowercased for DB)
// ---------------------------------------------------------------------------

export type OrderStatusDB =
  | 'draft'
  | 'submitted'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'refunded';

// ---------------------------------------------------------------------------
// Valid Transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<OrderStatusDB, OrderStatusDB[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'cancelled'],
  ready: ['completed'],
  completed: ['refunded'],
  cancelled: [],
  refunded: [],
};

export function isValidTransition(from: OrderStatusDB, to: OrderStatusDB): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// transitionOrder
// ---------------------------------------------------------------------------

function setRaw(record: Order, field: string, value: string | number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (record._raw as any)[field] = value;
}

export async function transitionOrder(orderId: string, newStatus: OrderStatusDB): Promise<void> {
  const record = await database.get<Order>('orders').find(orderId);
  const currentStatus = record.status as OrderStatusDB;

  if (!isValidTransition(currentStatus, newStatus)) {
    throw new Error(`Invalid order transition: ${currentStatus} → ${newStatus}`);
  }

  await database.write(async () => {
    const fresh = await database.get<Order>('orders').find(orderId);
    await fresh.update((o) => {
      setRaw(o, 'status', newStatus);
    });
  });
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<OrderStatusDB, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_progress: 'In Progress',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const STATUS_COLOURS: Record<OrderStatusDB, string> = {
  draft: '#9ca3af',
  submitted: '#3b82f6',
  in_progress: '#f59e0b',
  ready: '#10b981',
  completed: '#6b7280',
  cancelled: '#ef4444',
  refunded: '#8b5cf6',
};
