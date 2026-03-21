import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import type { Product } from './models';
import type { Order } from './models';
import type { Payment } from './models';
import type { Shift } from './models';
import type { CashMovement } from './models';
import type { Customer } from './models';

export async function getProductsByCategory(
  database: Database,
  categoryId: string,
): Promise<Product[]> {
  return database
    .get<Product>('products')
    .query(Q.where('category_id', categoryId), Q.sortBy('sort_order', Q.asc))
    .fetch();
}

export async function searchProducts(database: Database, query: string): Promise<Product[]> {
  return database
    .get<Product>('products')
    .query(Q.where('name', Q.like(`%${Q.sanitizeLikeString(query)}%`)))
    .fetch();
}

export async function getOrdersByStatus(database: Database, status: string): Promise<Order[]> {
  return database
    .get<Order>('orders')
    .query(Q.where('status', status), Q.sortBy('created_at', Q.desc))
    .fetch();
}

export async function getActiveShift(database: Database, staffId: string): Promise<Shift | null> {
  const shifts = await database
    .get<Shift>('shifts')
    .query(Q.where('staff_id', staffId), Q.where('status', 'open'))
    .fetch();

  return shifts[0] ?? null;
}

export async function getShiftCashTotal(
  database: Database,
  shiftOpenedAt: number,
): Promise<number> {
  // Sum cash payment amounts for orders created during this shift
  const payments = await database
    .get<Payment>('payments')
    .query(Q.where('method', 'cash'), Q.where('created_at', Q.gte(shiftOpenedAt)))
    .fetch();

  let total = 0;
  for (const p of payments) {
    if (p.status === 'completed') {
      total += p.amount;
    } else if (p.status === 'refunded') {
      total -= p.amount;
    }
  }
  return total;
}

export async function getHeldOrderCount(database: Database): Promise<number> {
  return database
    .get<Order>('orders')
    .query(Q.where('held_at', Q.notEq(null)), Q.where('held_at', Q.gt(0)))
    .fetchCount();
}

export async function getShiftCashMovementTotals(
  database: Database,
  shiftId: string,
): Promise<{ cashIn: number; cashOut: number }> {
  const movements = await database
    .get<CashMovement>('cash_movements')
    .query(Q.where('shift_id', shiftId))
    .fetch();

  let cashIn = 0;
  let cashOut = 0;
  for (const m of movements) {
    if (m.direction === 'in') {
      cashIn += m.amount;
    } else {
      cashOut += m.amount;
    }
  }
  return { cashIn, cashOut };
}

export async function getShiftCashMovements(
  database: Database,
  shiftId: string,
): Promise<CashMovement[]> {
  return database
    .get<CashMovement>('cash_movements')
    .query(Q.where('shift_id', shiftId), Q.sortBy('created_at', Q.desc))
    .fetch();
}

export async function getCustomerByPhone(
  database: Database,
  phone: string,
): Promise<Customer | null> {
  const customers = await database
    .get<Customer>('customers')
    .query(Q.where('phone', phone))
    .fetch();

  return customers[0] ?? null;
}
