import { Model } from "@nozbe/watermelondb";
import {
  text,
  field,
  date,
  json,
  relation,
  children,
  immutableRelation,
} from "@nozbe/watermelondb/decorators";

// ---------------------------------------------------------------------------
// Products & Modifiers
// ---------------------------------------------------------------------------

export class Product extends Model {
  static table = "products";

  static associations = {
    order_items: { type: "has_many" as const, foreignKey: "product_id" },
    product_modifier_groups: {
      type: "has_many" as const,
      foreignKey: "product_id",
    },
  };

  @text("server_id") serverId!: string;
  @text("name") name!: string;
  @field("price_cents") priceCents!: number;
  @text("category_id") categoryId!: string;
  @text("sku") sku?: string;
  @text("image_url") imageUrl?: string;
  @field("is_active") isActive!: boolean;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;

  @relation("categories", "category_id") category: any;
  @children("product_modifier_groups") productModifierGroups: any;
  @children("order_items") orderItems: any;
}

export class ModifierGroup extends Model {
  static table = "modifier_groups";

  static associations = {
    modifiers: { type: "has_many" as const, foreignKey: "modifier_group_id" },
    product_modifier_groups: {
      type: "has_many" as const,
      foreignKey: "modifier_group_id",
    },
  };

  @text("server_id") serverId!: string;
  @text("name") name!: string;
  @field("min_selections") minSelections!: number;
  @field("max_selections") maxSelections!: number;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;

  @children("modifiers") modifiers: any;
  @children("product_modifier_groups") productModifierGroups: any;
}

export class Modifier extends Model {
  static table = "modifiers";

  static associations = {
    modifier_groups: {
      type: "belongs_to" as const,
      key: "modifier_group_id",
    },
  };

  @text("server_id") serverId!: string;
  @text("name") name!: string;
  @field("price_cents") priceCents!: number;
  @text("modifier_group_id") modifierGroupId!: string;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;

  @immutableRelation("modifier_groups", "modifier_group_id")
  modifierGroup: any;
}

export class ProductModifierGroup extends Model {
  static table = "product_modifier_groups";

  static associations = {
    products: { type: "belongs_to" as const, key: "product_id" },
    modifier_groups: {
      type: "belongs_to" as const,
      key: "modifier_group_id",
    },
  };

  @text("server_id") serverId!: string;
  @text("product_id") productId!: string;
  @text("modifier_group_id") modifierGroupId!: string;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;

  @immutableRelation("products", "product_id") product: any;
  @immutableRelation("modifier_groups", "modifier_group_id")
  modifierGroup: any;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export class Category extends Model {
  static table = "categories";

  static associations = {
    products: { type: "has_many" as const, foreignKey: "category_id" },
  };

  @text("server_id") serverId!: string;
  @text("name") name!: string;
  @field("sort_order") sortOrder!: number;
  @text("color") color?: string;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;

  @children("products") products: any;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export class Customer extends Model {
  static table = "customers";

  static associations = {
    orders: { type: "has_many" as const, foreignKey: "customer_id" },
  };

  @text("server_id") serverId!: string;
  @text("first_name") firstName!: string;
  @text("last_name") lastName!: string;
  @text("email") email?: string;
  @text("phone") phone?: string;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;

  @children("orders") orders: any;
}

// ---------------------------------------------------------------------------
// Orders & Payments
// ---------------------------------------------------------------------------

export class Order extends Model {
  static table = "orders";

  static associations = {
    order_items: { type: "has_many" as const, foreignKey: "order_id" },
    payments: { type: "has_many" as const, foreignKey: "order_id" },
    customers: { type: "belongs_to" as const, key: "customer_id" },
    staff: { type: "belongs_to" as const, key: "staff_id" },
  };

  @text("server_id") serverId!: string;
  @text("status") status!: string;
  @text("order_type") orderType!: string;
  @text("customer_id") customerId?: string;
  @text("staff_id") staffId!: string;
  @field("subtotal_cents") subtotalCents!: number;
  @field("tax_cents") taxCents!: number;
  @field("total_cents") totalCents!: number;
  @text("notes") notes?: string;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;

  @relation("customers", "customer_id") customer: any;
  @relation("staff", "staff_id") staffMember: any;
  @children("order_items") items: any;
  @children("payments") payments: any;
}

export class OrderItem extends Model {
  static table = "order_items";

  static associations = {
    orders: { type: "belongs_to" as const, key: "order_id" },
    products: { type: "belongs_to" as const, key: "product_id" },
  };

  @text("server_id") serverId!: string;
  @text("order_id") orderId!: string;
  @text("product_id") productId!: string;
  @field("quantity") quantity!: number;
  @field("unit_price_cents") unitPriceCents!: number;
  @json("modifiers_json", (raw: any) => raw ?? []) modifiersJson!: any[];
  @text("notes") notes?: string;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;

  @immutableRelation("orders", "order_id") order: any;
  @immutableRelation("products", "product_id") product: any;
}

export class Payment extends Model {
  static table = "payments";

  static associations = {
    orders: { type: "belongs_to" as const, key: "order_id" },
  };

  @text("server_id") serverId!: string;
  @text("order_id") orderId!: string;
  @text("method") method!: string;
  @field("amount_cents") amountCents!: number;
  @text("reference") reference?: string;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;

  @immutableRelation("orders", "order_id") order: any;
}

// ---------------------------------------------------------------------------
// Shifts & Staff
// ---------------------------------------------------------------------------

export class Shift extends Model {
  static table = "shifts";

  static associations = {
    staff: { type: "belongs_to" as const, key: "staff_id" },
  };

  @text("server_id") serverId!: string;
  @text("staff_id") staffId!: string;
  @date("started_at") startedAt!: Date;
  @date("ended_at") endedAt?: Date;
  @field("opening_cash_cents") openingCashCents!: number;
  @field("closing_cash_cents") closingCashCents?: number;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;

  @immutableRelation("staff", "staff_id") staffMember: any;
}

export class Staff extends Model {
  static table = "staff";

  static associations = {
    orders: { type: "has_many" as const, foreignKey: "staff_id" },
    shifts: { type: "has_many" as const, foreignKey: "staff_id" },
  };

  @text("server_id") serverId!: string;
  @text("name") name!: string;
  @text("pin_hash") pinHash!: string;
  @text("role") role!: string;
  @field("is_active") isActive!: boolean;
  @date("created_at") createdAt!: Date;
  @date("updated_at") updatedAt!: Date;

  @children("orders") orders: any;
  @children("shifts") shifts: any;
}
