import { Model } from '@nozbe/watermelondb';
import {
  text,
  field,
  date,
  json,
  relation,
  children,
  immutableRelation,
} from '@nozbe/watermelondb/decorators';

// ---------------------------------------------------------------------------
// Products & Modifiers
// ---------------------------------------------------------------------------

export class Product extends Model {
  static table = 'products';

  static associations = {
    order_items: { type: 'has_many' as const, foreignKey: 'product_id' },
    product_modifier_groups: {
      type: 'has_many' as const,
      foreignKey: 'product_id',
    },
  };

  @text('server_id') serverId!: string;
  @text('name') name!: string;
  @text('description') description?: string;
  @text('category_id') categoryId!: string;
  @field('base_price') basePrice!: number;
  @text('sku') sku?: string;
  @text('barcode') barcode?: string;
  @text('image_url') imageUrl?: string;
  @field('is_available') isAvailable!: boolean;
  @field('is_gst_free') isGstFree!: boolean;
  @field('sort_order') sortOrder!: number;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('categories', 'category_id') category: any;
  @children('product_modifier_groups') productModifierGroups: any;
  @children('order_items') orderItems: any;
}

export class ModifierGroup extends Model {
  static table = 'modifier_groups';

  static associations = {
    modifiers: { type: 'has_many' as const, foreignKey: 'modifier_group_id' },
    product_modifier_groups: {
      type: 'has_many' as const,
      foreignKey: 'modifier_group_id',
    },
  };

  @text('server_id') serverId!: string;
  @text('name') name!: string;
  @text('display_name') displayName?: string;
  @text('selection_type') selectionType!: string;
  @field('min_selections') minSelections!: number;
  @field('max_selections') maxSelections!: number;
  @field('sort_order') sortOrder!: number;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @children('modifiers') modifiers: any;
  @children('product_modifier_groups') productModifierGroups: any;
}

export class Modifier extends Model {
  static table = 'modifiers';

  static associations = {
    modifier_groups: {
      type: 'belongs_to' as const,
      key: 'modifier_group_id',
    },
  };

  @text('server_id') serverId!: string;
  @text('name') name!: string;
  @text('modifier_group_id') modifierGroupId!: string;
  @field('price_adjustment') priceAdjustment!: number;
  @field('is_default') isDefault!: boolean;
  @field('is_available') isAvailable!: boolean;
  @field('sort_order') sortOrder!: number;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @immutableRelation('modifier_groups', 'modifier_group_id')
  modifierGroup: any;
}

export class ProductModifierGroup extends Model {
  static table = 'product_modifier_groups';

  static associations = {
    products: { type: 'belongs_to' as const, key: 'product_id' },
    modifier_groups: {
      type: 'belongs_to' as const,
      key: 'modifier_group_id',
    },
  };

  @text('server_id') serverId!: string;
  @text('product_id') productId!: string;
  @text('modifier_group_id') modifierGroupId!: string;
  @field('sort_order') sortOrder!: number;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @immutableRelation('products', 'product_id') product: any;
  @immutableRelation('modifier_groups', 'modifier_group_id')
  modifierGroup: any;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export class Category extends Model {
  static table = 'categories';

  static associations = {
    products: { type: 'has_many' as const, foreignKey: 'category_id' },
  };

  @text('server_id') serverId!: string;
  @text('name') name!: string;
  @text('colour') colour?: string;
  @text('icon') icon?: string;
  @field('sort_order') sortOrder!: number;
  @text('parent_id') parentId?: string;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @children('products') products: any;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export class Customer extends Model {
  static table = 'customers';

  static associations = {
    orders: { type: 'has_many' as const, foreignKey: 'customer_id' },
  };

  @text('server_id') serverId!: string;
  @text('first_name') firstName!: string;
  @text('last_name') lastName!: string;
  @text('email') email?: string;
  @text('phone') phone?: string;
  @text('loyalty_tier') loyaltyTier?: string;
  @field('loyalty_balance') loyaltyBalance!: number;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @children('orders') orders: any;
}

// ---------------------------------------------------------------------------
// Orders & Payments
// ---------------------------------------------------------------------------

export class Order extends Model {
  static table = 'orders';

  static associations = {
    order_items: { type: 'has_many' as const, foreignKey: 'order_id' },
    payments: { type: 'has_many' as const, foreignKey: 'order_id' },
    customers: { type: 'belongs_to' as const, key: 'customer_id' },
    staff: { type: 'belongs_to' as const, key: 'staff_id' },
  };

  @text('server_id') serverId!: string;
  @text('order_number') orderNumber!: string;
  @text('order_type') orderType!: string;
  @text('status') status!: string;
  @text('table_number') tableNumber?: string;
  @text('customer_id') customerId?: string;
  @text('staff_id') staffId!: string;
  @text('terminal_id') terminalId!: string;
  @field('subtotal') subtotal!: number;
  @field('gst') gst!: number;
  @field('total') total!: number;
  @field('discount_amount') discountAmount!: number;
  @text('notes') notes?: string;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @relation('customers', 'customer_id') customer: any;
  @relation('staff', 'staff_id') staffMember: any;
  @children('order_items') items: any;
  @children('payments') payments: any;
}

export class OrderItem extends Model {
  static table = 'order_items';

  static associations = {
    orders: { type: 'belongs_to' as const, key: 'order_id' },
    products: { type: 'belongs_to' as const, key: 'product_id' },
  };

  @text('server_id') serverId!: string;
  @text('order_id') orderId!: string;
  @text('product_id') productId!: string;
  @field('quantity') quantity!: number;
  @field('unit_price') unitPrice!: number;
  @json('modifiers_json', (raw: any) => raw ?? []) modifiersJson!: any[];
  @field('line_total') lineTotal!: number;
  @text('notes') notes?: string;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @immutableRelation('orders', 'order_id') order: any;
  @immutableRelation('products', 'product_id') product: any;
}

export class Payment extends Model {
  static table = 'payments';

  static associations = {
    orders: { type: 'belongs_to' as const, key: 'order_id' },
  };

  @text('server_id') serverId!: string;
  @text('order_id') orderId!: string;
  @text('method') method!: string;
  @field('amount') amount!: number;
  @field('tip_amount') tipAmount!: number;
  @text('reference') reference?: string;
  @text('status') status!: string;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @immutableRelation('orders', 'order_id') order: any;
}

// ---------------------------------------------------------------------------
// Shifts & Staff
// ---------------------------------------------------------------------------

export class Shift extends Model {
  static table = 'shifts';

  static associations = {
    staff: { type: 'belongs_to' as const, key: 'staff_id' },
  };

  @text('server_id') serverId!: string;
  @text('staff_id') staffId!: string;
  @text('terminal_id') terminalId!: string;
  @date('opened_at') openedAt!: Date;
  @date('closed_at') closedAt?: Date;
  @field('opening_float') openingFloat!: number;
  @field('closing_float') closingFloat?: number;
  @field('expected_cash') expectedCash?: number;
  @field('actual_cash') actualCash?: number;
  @field('variance') variance?: number;
  @text('status') status!: string;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @immutableRelation('staff', 'staff_id') staffMember: any;
}

export class Staff extends Model {
  static table = 'staff';

  static associations = {
    orders: { type: 'has_many' as const, foreignKey: 'staff_id' },
    shifts: { type: 'has_many' as const, foreignKey: 'staff_id' },
  };

  @text('server_id') serverId!: string;
  @text('first_name') firstName!: string;
  @text('last_name') lastName!: string;
  @text('role') role!: string;
  @text('pin_hash') pinHash!: string;
  @field('is_active') isActive!: boolean;
  @json('permissions_json', (raw: any) => raw ?? []) permissionsJson!: string[];
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @children('orders') orders: any;
  @children('shifts') shifts: any;
}
