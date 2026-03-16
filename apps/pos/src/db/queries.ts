import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import type { Product } from './models';
import type { Order } from './models';
import type { Shift } from './models';
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
