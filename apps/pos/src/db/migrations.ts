import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        // products: add description, barcode, sort_order; rename price_cents→base_price, is_active→is_available
        addColumns({
          table: 'products',
          columns: [
            { name: 'description', type: 'string', isOptional: true },
            { name: 'base_price', type: 'number' },
            { name: 'barcode', type: 'string', isOptional: true },
            { name: 'is_available', type: 'boolean' },
            { name: 'sort_order', type: 'number' },
          ],
        }),

        // modifier_groups: add display_name, selection_type, sort_order
        addColumns({
          table: 'modifier_groups',
          columns: [
            { name: 'display_name', type: 'string', isOptional: true },
            { name: 'selection_type', type: 'string' },
            { name: 'sort_order', type: 'number' },
          ],
        }),

        // modifiers: add price_adjustment, is_default, is_available, sort_order
        addColumns({
          table: 'modifiers',
          columns: [
            { name: 'price_adjustment', type: 'number' },
            { name: 'is_default', type: 'boolean' },
            { name: 'is_available', type: 'boolean' },
            { name: 'sort_order', type: 'number' },
          ],
        }),

        // product_modifier_groups: add sort_order
        addColumns({
          table: 'product_modifier_groups',
          columns: [{ name: 'sort_order', type: 'number' }],
        }),

        // categories: add colour, icon, parent_id (rename color→colour)
        addColumns({
          table: 'categories',
          columns: [
            { name: 'colour', type: 'string', isOptional: true },
            { name: 'icon', type: 'string', isOptional: true },
            { name: 'parent_id', type: 'string', isOptional: true },
          ],
        }),

        // customers: add loyalty_tier, loyalty_balance
        addColumns({
          table: 'customers',
          columns: [
            { name: 'loyalty_tier', type: 'string', isOptional: true },
            { name: 'loyalty_balance', type: 'number' },
          ],
        }),

        // orders: add order_number, table_number, terminal_id, subtotal, gst, total, discount_amount
        addColumns({
          table: 'orders',
          columns: [
            { name: 'order_number', type: 'string' },
            { name: 'table_number', type: 'string', isOptional: true },
            { name: 'terminal_id', type: 'string' },
            { name: 'subtotal', type: 'number' },
            { name: 'gst', type: 'number' },
            { name: 'total', type: 'number' },
            { name: 'discount_amount', type: 'number' },
          ],
        }),

        // order_items: add unit_price, line_total
        addColumns({
          table: 'order_items',
          columns: [
            { name: 'unit_price', type: 'number' },
            { name: 'line_total', type: 'number' },
          ],
        }),

        // payments: add amount, tip_amount, status
        addColumns({
          table: 'payments',
          columns: [
            { name: 'amount', type: 'number' },
            { name: 'tip_amount', type: 'number' },
            { name: 'status', type: 'string' },
          ],
        }),

        // shifts: add terminal_id, opened_at, closed_at, opening_float, closing_float, expected_cash, actual_cash, variance, status
        addColumns({
          table: 'shifts',
          columns: [
            { name: 'terminal_id', type: 'string' },
            { name: 'opened_at', type: 'number' },
            { name: 'closed_at', type: 'number', isOptional: true },
            { name: 'opening_float', type: 'number' },
            { name: 'closing_float', type: 'number', isOptional: true },
            { name: 'expected_cash', type: 'number', isOptional: true },
            { name: 'actual_cash', type: 'number', isOptional: true },
            { name: 'variance', type: 'number', isOptional: true },
            { name: 'status', type: 'string' },
          ],
        }),

        // staff: add first_name, last_name, permissions_json
        addColumns({
          table: 'staff',
          columns: [
            { name: 'first_name', type: 'string' },
            { name: 'last_name', type: 'string' },
            { name: 'permissions_json', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'products',
          columns: [{ name: 'is_gst_free', type: 'boolean' }],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'orders',
          columns: [{ name: 'held_at', type: 'number', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: 'orders',
          columns: [
            { name: 'discount_type', type: 'string', isOptional: true },
            { name: 'discount_value', type: 'number' },
            { name: 'discount_reason', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'order_items',
          columns: [
            { name: 'discount_amount', type: 'number' },
            { name: 'discount_type', type: 'string', isOptional: true },
            { name: 'discount_value', type: 'number' },
            { name: 'discount_reason', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'order_items',
          columns: [
            { name: 'voided_at', type: 'number', isOptional: true },
            { name: 'void_reason', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'audit_logs',
          columns: [
            { name: 'server_id', type: 'string' },
            { name: 'action', type: 'string' },
            { name: 'entity_type', type: 'string' },
            { name: 'entity_id', type: 'string' },
            { name: 'staff_id', type: 'string' },
            { name: 'manager_approver', type: 'string', isOptional: true },
            { name: 'changes_json', type: 'string', isOptional: true },
            { name: 'device_id', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: 'order_items',
          columns: [
            { name: 'override_price', type: 'number' },
            { name: 'override_reason', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: 'payments',
          columns: [
            { name: 'tendered_amount', type: 'number', isOptional: true },
            { name: 'change_given', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 9,
      steps: [
        addColumns({
          table: 'payments',
          columns: [
            { name: 'rounding_amount', type: 'number', isOptional: true },
            { name: 'card_type', type: 'string', isOptional: true },
            { name: 'last_four', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 10,
      steps: [
        addColumns({
          table: 'orders',
          columns: [{ name: 'receipt_json', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 11,
      steps: [
        addColumns({
          table: 'shifts',
          columns: [{ name: 'variance_notes', type: 'string', isOptional: true }],
        }),
      ],
    },
  ],
});
