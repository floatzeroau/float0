import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { schema } from './schema';
import { migrations } from './migrations';
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

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
  onSetUpError: (error) => {
    console.error('WatermelonDB setup error:', error);
  },
});

export const database = new Database({
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
