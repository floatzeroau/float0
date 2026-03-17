import { calculateGST } from './money.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CartItemModifier {
  priceAdjustment: number;
}

export interface CartItem {
  unitPrice: number;
  quantity: number;
  isGstFree: boolean;
  modifiers: CartItemModifier[];
}

export interface CartTotals {
  subtotal: number;
  gstAmount: number;
  total: number;
}

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
 * Calculate cart totals from a list of cart items.
 * - subtotal: sum of all line totals
 * - gstAmount: sum of GST for taxable items (GST-inclusive, so GST = lineTotal / 11)
 * - total: equals subtotal (prices are GST-inclusive in Australia)
 */
export function calculateCartTotals(items: CartItem[]): CartTotals {
  let subtotal = 0;
  let gstAmount = 0;

  for (const item of items) {
    const adjustments = item.modifiers.map((m) => m.priceAdjustment);
    const lineTotal = calculateLineTotal(item.unitPrice, adjustments, item.quantity);
    subtotal += lineTotal;

    if (!item.isGstFree) {
      gstAmount += calculateGST(lineTotal);
    }
  }

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    gstAmount: Math.round(gstAmount * 100) / 100,
    total: Math.round(subtotal * 100) / 100,
  };
}
