import { calculateGST } from './money.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiscountType = 'percentage' | 'fixed';

export interface ItemDiscount {
  type: DiscountType;
  value: number;
}

export interface OrderDiscount {
  type: DiscountType;
  value: number;
}

export interface CartItemModifier {
  priceAdjustment: number;
}

export interface CartItem {
  unitPrice: number;
  quantity: number;
  isGstFree: boolean;
  modifiers: CartItemModifier[];
  discount?: ItemDiscount;
  voidedAt?: number;
  overridePrice?: number;
}

export interface CartTotals {
  subtotal: number;
  gstAmount: number;
  total: number;
  itemDiscountTotal: number;
  orderDiscountAmount: number;
  totalDiscount: number;
}

// ---------------------------------------------------------------------------
// Discount thresholds
// ---------------------------------------------------------------------------

export const DISCOUNT_THRESHOLDS = {
  percentageMax: 20,
  fixedMax: 10,
};

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Calculate the line total for a single item.
 * lineTotal = (basePrice + sum of modifier adjustments) * quantity
 */
export function calculateLineTotal(
  basePrice: number,
  modifierAdjustments: number[],
  quantity: number,
): number {
  if (quantity <= 0) return 0;
  const adjustmentSum = modifierAdjustments.reduce((sum, adj) => sum + adj, 0);
  return (basePrice + adjustmentSum) * quantity;
}

/**
 * Calculate the dollar amount of an item-level discount.
 * Percentage is capped at 100%, fixed is capped at lineTotal.
 */
export function calculateItemDiscount(lineTotal: number, discount: ItemDiscount): number {
  if (lineTotal <= 0 || discount.value <= 0) return 0;

  if (discount.type === 'percentage') {
    const pct = Math.min(discount.value, 100);
    return Math.round(lineTotal * (pct / 100) * 100) / 100;
  }

  // fixed
  return Math.min(discount.value, lineTotal);
}

/**
 * Calculate the dollar amount of an order-level discount.
 * Percentage is capped at 100%, fixed is capped at subtotal.
 */
export function calculateOrderDiscount(subtotal: number, discount: OrderDiscount): number {
  if (subtotal <= 0 || discount.value <= 0) return 0;

  if (discount.type === 'percentage') {
    const pct = Math.min(discount.value, 100);
    return Math.round(subtotal * (pct / 100) * 100) / 100;
  }

  // fixed
  return Math.min(discount.value, subtotal);
}

/**
 * Check if a discount requires manager approval based on thresholds.
 */
export function requiresManagerApproval(
  type: DiscountType,
  value: number,
  thresholds: { percentageMax: number; fixedMax: number } = DISCOUNT_THRESHOLDS,
): boolean {
  if (type === 'percentage') {
    return value > thresholds.percentageMax;
  }
  return value > thresholds.fixedMax;
}

/**
 * Calculate cart totals from a list of cart items.
 * - subtotal: sum of all line totals (before order discount)
 * - gstAmount: sum of GST for taxable items (GST-inclusive, so GST = lineTotal / 11)
 * - total: equals subtotal minus discounts (prices are GST-inclusive in Australia)
 *
 * When an order discount is applied, GST is proportionally reduced.
 */
export function calculateCartTotals(items: CartItem[], orderDiscount?: OrderDiscount): CartTotals {
  let subtotal = 0;
  let gstAmount = 0;
  let itemDiscountTotal = 0;

  for (const item of items) {
    if (item.voidedAt && item.voidedAt > 0) continue;

    const adjustments = item.modifiers.map((m) => m.priceAdjustment);
    const basePrice =
      item.overridePrice != null && item.overridePrice > 0 ? item.overridePrice : item.unitPrice;
    const lineTotal = calculateLineTotal(basePrice, adjustments, item.quantity);

    // Apply item-level discount
    let discountedLineTotal = lineTotal;
    if (item.discount && item.discount.value > 0) {
      const itemDiscountAmt = calculateItemDiscount(lineTotal, item.discount);
      discountedLineTotal = lineTotal - itemDiscountAmt;
      itemDiscountTotal += itemDiscountAmt;
    }

    subtotal += discountedLineTotal;

    if (!item.isGstFree) {
      gstAmount += calculateGST(discountedLineTotal);
    }
  }

  // Apply order-level discount
  let orderDiscountAmount = 0;
  if (orderDiscount && orderDiscount.value > 0 && subtotal > 0) {
    orderDiscountAmount = calculateOrderDiscount(subtotal, orderDiscount);

    // Proportionally reduce GST
    const discountRatio = orderDiscountAmount / subtotal;
    gstAmount = gstAmount * (1 - discountRatio);
  }

  const total = subtotal - orderDiscountAmount;
  const totalDiscount = itemDiscountTotal + orderDiscountAmount;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    gstAmount: Math.round(gstAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
    itemDiscountTotal: Math.round(itemDiscountTotal * 100) / 100,
    orderDiscountAmount: Math.round(orderDiscountAmount * 100) / 100,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
  };
}
