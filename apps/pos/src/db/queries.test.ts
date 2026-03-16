import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';

import { schema } from './schema';
import {
  Product,
  ModifierGroup,
  Modifier,
  ProductModifierGroup,
  Category,
  Customer,
  Order,
  OrderItem,
  Payment,
  Shift,
  Staff,
} from './models';
import {
  getProductsByCategory,
  searchProducts,
  getOrdersByStatus,
  getActiveShift,
  getCustomerByPhone,
} from './queries';

function createTestDatabase(): Database {
  const adapter = new LokiJSAdapter({
    schema,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
  });
  return new Database({
    adapter,
    modelClasses: [
      Product,
      ModifierGroup,
      Modifier,
      ProductModifierGroup,
      Category,
      Customer,
      Order,
      OrderItem,
      Payment,
      Shift,
      Staff,
    ],
  });
}

describe('getProductsByCategory', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  it('returns products filtered by category_id', async () => {
    await db.write(async () => {
      await db.get<Product>('products').create((p) => {
        p._raw.id = 'p1';
        (p as any)._raw.name = 'Flat White';
        (p as any)._raw.category_id = 'cat-coffee';
        (p as any)._raw.base_price = 450;
        (p as any)._raw.is_available = true;
        (p as any)._raw.sort_order = 1;
        (p as any)._raw.server_id = 's1';
      });
      await db.get<Product>('products').create((p) => {
        p._raw.id = 'p2';
        (p as any)._raw.name = 'Croissant';
        (p as any)._raw.category_id = 'cat-food';
        (p as any)._raw.base_price = 550;
        (p as any)._raw.is_available = true;
        (p as any)._raw.sort_order = 1;
        (p as any)._raw.server_id = 's2';
      });
      await db.get<Product>('products').create((p) => {
        p._raw.id = 'p3';
        (p as any)._raw.name = 'Latte';
        (p as any)._raw.category_id = 'cat-coffee';
        (p as any)._raw.base_price = 500;
        (p as any)._raw.is_available = true;
        (p as any)._raw.sort_order = 2;
        (p as any)._raw.server_id = 's3';
      });
    });

    const products = await getProductsByCategory(db, 'cat-coffee');
    expect(products).toHaveLength(2);
    expect(products.map((p) => p.name)).toEqual(['Flat White', 'Latte']);
  });

  it('returns empty array for category with no products', async () => {
    const products = await getProductsByCategory(db, 'cat-nonexistent');
    expect(products).toEqual([]);
  });
});

describe('searchProducts', () => {
  let db: Database;

  beforeEach(async () => {
    db = createTestDatabase();
    await db.write(async () => {
      await db.get<Product>('products').create((p) => {
        (p as any)._raw.name = 'Flat White';
        (p as any)._raw.category_id = 'cat1';
        (p as any)._raw.base_price = 450;
        (p as any)._raw.is_available = true;
        (p as any)._raw.sort_order = 1;
        (p as any)._raw.server_id = 's1';
      });
      await db.get<Product>('products').create((p) => {
        (p as any)._raw.name = 'Flat Black';
        (p as any)._raw.category_id = 'cat1';
        (p as any)._raw.base_price = 400;
        (p as any)._raw.is_available = true;
        (p as any)._raw.sort_order = 2;
        (p as any)._raw.server_id = 's2';
      });
      await db.get<Product>('products').create((p) => {
        (p as any)._raw.name = 'Croissant';
        (p as any)._raw.category_id = 'cat2';
        (p as any)._raw.base_price = 550;
        (p as any)._raw.is_available = true;
        (p as any)._raw.sort_order = 1;
        (p as any)._raw.server_id = 's3';
      });
    });
  });

  it('finds products matching search query', async () => {
    const products = await searchProducts(db, 'Flat');
    expect(products).toHaveLength(2);
  });

  it('returns empty for no match', async () => {
    const products = await searchProducts(db, 'Espresso');
    expect(products).toEqual([]);
  });
});

describe('getOrdersByStatus', () => {
  let db: Database;

  beforeEach(async () => {
    db = createTestDatabase();
    await db.write(async () => {
      await db.get<Order>('orders').create((o) => {
        (o as any)._raw.order_number = 'ORD-001';
        (o as any)._raw.order_type = 'dine_in';
        (o as any)._raw.status = 'pending';
        (o as any)._raw.staff_id = 'staff1';
        (o as any)._raw.terminal_id = 'term1';
        (o as any)._raw.subtotal = 1000;
        (o as any)._raw.gst = 100;
        (o as any)._raw.total = 1100;
        (o as any)._raw.discount_amount = 0;
        (o as any)._raw.server_id = 's1';
      });
      await db.get<Order>('orders').create((o) => {
        (o as any)._raw.order_number = 'ORD-002';
        (o as any)._raw.order_type = 'takeaway';
        (o as any)._raw.status = 'completed';
        (o as any)._raw.staff_id = 'staff1';
        (o as any)._raw.terminal_id = 'term1';
        (o as any)._raw.subtotal = 500;
        (o as any)._raw.gst = 50;
        (o as any)._raw.total = 550;
        (o as any)._raw.discount_amount = 0;
        (o as any)._raw.server_id = 's2';
      });
      await db.get<Order>('orders').create((o) => {
        (o as any)._raw.order_number = 'ORD-003';
        (o as any)._raw.order_type = 'dine_in';
        (o as any)._raw.status = 'pending';
        (o as any)._raw.staff_id = 'staff2';
        (o as any)._raw.terminal_id = 'term1';
        (o as any)._raw.subtotal = 2000;
        (o as any)._raw.gst = 200;
        (o as any)._raw.total = 2200;
        (o as any)._raw.discount_amount = 0;
        (o as any)._raw.server_id = 's3';
      });
    });
  });

  it('filters orders by status', async () => {
    const pending = await getOrdersByStatus(db, 'pending');
    expect(pending).toHaveLength(2);

    const completed = await getOrdersByStatus(db, 'completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].orderNumber).toBe('ORD-002');
  });
});

describe('getActiveShift', () => {
  let db: Database;

  beforeEach(async () => {
    db = createTestDatabase();
    await db.write(async () => {
      await db.get<Shift>('shifts').create((s) => {
        (s as any)._raw.staff_id = 'staff1';
        (s as any)._raw.terminal_id = 'term1';
        (s as any)._raw.opened_at = Date.now();
        (s as any)._raw.opening_float = 20000;
        (s as any)._raw.status = 'open';
        (s as any)._raw.server_id = 's1';
      });
      await db.get<Shift>('shifts').create((s) => {
        (s as any)._raw.staff_id = 'staff1';
        (s as any)._raw.terminal_id = 'term1';
        (s as any)._raw.opened_at = Date.now() - 86400000;
        (s as any)._raw.closed_at = Date.now() - 3600000;
        (s as any)._raw.opening_float = 20000;
        (s as any)._raw.closing_float = 25000;
        (s as any)._raw.status = 'closed';
        (s as any)._raw.server_id = 's2';
      });
    });
  });

  it('returns the active (open) shift for a staff member', async () => {
    const shift = await getActiveShift(db, 'staff1');
    expect(shift).not.toBeNull();
    expect(shift!.status).toBe('open');
  });

  it('returns null when no active shift', async () => {
    const shift = await getActiveShift(db, 'staff-none');
    expect(shift).toBeNull();
  });
});

describe('getCustomerByPhone', () => {
  let db: Database;

  beforeEach(async () => {
    db = createTestDatabase();
    await db.write(async () => {
      await db.get<Customer>('customers').create((c) => {
        (c as any)._raw.first_name = 'Jane';
        (c as any)._raw.last_name = 'Doe';
        (c as any)._raw.phone = '+61400000001';
        (c as any)._raw.loyalty_balance = 500;
        (c as any)._raw.server_id = 's1';
      });
    });
  });

  it('finds customer by phone number', async () => {
    const customer = await getCustomerByPhone(db, '+61400000001');
    expect(customer).not.toBeNull();
    expect(customer!.firstName).toBe('Jane');
  });

  it('returns null for unknown phone', async () => {
    const customer = await getCustomerByPhone(db, '+61499999999');
    expect(customer).toBeNull();
  });
});
