import { describe, expect, it } from 'vitest';
import {
  calculateLineTotal,
  calculateCartTotals,
  calculateItemDiscount,
  calculateOrderDiscount,
  requiresManagerApproval,
  calculatePaymentTotal,
  DISCOUNT_THRESHOLDS,
} from './cart-calculator.js';

describe('calculateLineTotal', () => {
  it('calculates base price * quantity with no modifiers', () => {
    expect(calculateLineTotal(4.5, [], 2)).toBe(9);
  });

  it('includes modifier adjustments', () => {
    // $4.50 + $0.50 (large) + $0.50 (extra shot) = $5.50 * 1 = $5.50
    expect(calculateLineTotal(4.5, [0.5, 0.5], 1)).toBe(5.5);
  });

  it('handles negative adjustments (discounts)', () => {
    // $4.50 - $0.30 (keep cup) = $4.20 * 1 = $4.20
    expect(calculateLineTotal(4.5, [-0.3], 1)).toBeCloseTo(4.2);
  });

  it('returns 0 for zero quantity', () => {
    expect(calculateLineTotal(4.5, [0.5], 0)).toBe(0);
  });

  it('returns 0 for negative quantity', () => {
    expect(calculateLineTotal(4.5, [], -1)).toBe(0);
  });

  it('multiplies correctly with quantity > 1', () => {
    // ($4.50 + $0.50) * 3 = $15.00
    expect(calculateLineTotal(4.5, [0.5], 3)).toBe(15);
  });
});

describe('calculateCartTotals', () => {
  it('calculates totals for all taxable items', () => {
    const result = calculateCartTotals([
      { unitPrice: 4.5, quantity: 1, isGstFree: false, modifiers: [] },
      { unitPrice: 4.5, quantity: 1, isGstFree: false, modifiers: [] },
    ]);

    expect(result.subtotal).toBe(9);
    expect(result.total).toBe(9);
    // GST = 9 / 11 ≈ 0.818181... → rounds to 0.82
    expect(result.gstAmount).toBe(0.82);
  });

  it('excludes GST-free items from GST calculation', () => {
    const result = calculateCartTotals([
      { unitPrice: 4.5, quantity: 1, isGstFree: false, modifiers: [] },
      { unitPrice: 3.0, quantity: 1, isGstFree: true, modifiers: [] },
    ]);

    expect(result.subtotal).toBe(7.5);
    expect(result.total).toBe(7.5);
    // Only $4.50 is taxable: GST = 4.50 / 11 ≈ 0.409... → rounds to 0.41
    expect(result.gstAmount).toBe(0.41);
  });

  it('handles items with modifiers', () => {
    const result = calculateCartTotals([
      {
        unitPrice: 4.5,
        quantity: 2,
        isGstFree: false,
        modifiers: [{ priceAdjustment: 0.5 }, { priceAdjustment: 0.5 }],
      },
    ]);

    // ($4.50 + $0.50 + $0.50) * 2 = $11.00
    expect(result.subtotal).toBe(11);
    expect(result.total).toBe(11);
    // GST = 11 / 11 = 1.00
    expect(result.gstAmount).toBe(1);
  });

  it('handles empty cart', () => {
    const result = calculateCartTotals([]);
    expect(result.subtotal).toBe(0);
    expect(result.gstAmount).toBe(0);
    expect(result.total).toBe(0);
  });

  it('handles zero quantity items', () => {
    const result = calculateCartTotals([
      { unitPrice: 4.5, quantity: 0, isGstFree: false, modifiers: [] },
    ]);

    expect(result.subtotal).toBe(0);
    expect(result.gstAmount).toBe(0);
    expect(result.total).toBe(0);
  });

  it('handles mixed taxable and GST-free with modifiers', () => {
    const result = calculateCartTotals([
      // Flat White Large: ($4.50 + $1.00) * 1 = $5.50 (taxable)
      { unitPrice: 4.5, quantity: 1, isGstFree: false, modifiers: [{ priceAdjustment: 1.0 }] },
      // Plain Milk: $2.00 * 2 = $4.00 (GST-free)
      { unitPrice: 2.0, quantity: 2, isGstFree: true, modifiers: [] },
      // Croissant: $5.00 * 1 = $5.00 (taxable)
      { unitPrice: 5.0, quantity: 1, isGstFree: false, modifiers: [] },
    ]);

    expect(result.subtotal).toBe(14.5);
    expect(result.total).toBe(14.5);
    // GST on taxable: ($5.50 + $5.00) / 11 = 10.50 / 11 ≈ 0.954545... → rounds to 0.95
    expect(result.gstAmount).toBe(0.95);
  });

  it('returns zero discount fields when no discounts applied', () => {
    const result = calculateCartTotals([
      { unitPrice: 10, quantity: 1, isGstFree: false, modifiers: [] },
    ]);
    expect(result.itemDiscountTotal).toBe(0);
    expect(result.orderDiscountAmount).toBe(0);
    expect(result.totalDiscount).toBe(0);
  });
});

describe('calculateItemDiscount', () => {
  it('calculates percentage discount', () => {
    // 10% of $20 = $2
    expect(calculateItemDiscount(20, { type: 'percentage', value: 10 })).toBe(2);
  });

  it('calculates fixed discount', () => {
    expect(calculateItemDiscount(20, { type: 'fixed', value: 5 })).toBe(5);
  });

  it('caps percentage at 100%', () => {
    expect(calculateItemDiscount(20, { type: 'percentage', value: 150 })).toBe(20);
  });

  it('caps fixed at line total', () => {
    expect(calculateItemDiscount(10, { type: 'fixed', value: 15 })).toBe(10);
  });

  it('returns 0 for zero discount value', () => {
    expect(calculateItemDiscount(20, { type: 'percentage', value: 0 })).toBe(0);
  });

  it('returns 0 for zero line total', () => {
    expect(calculateItemDiscount(0, { type: 'percentage', value: 10 })).toBe(0);
  });

  it('handles fractional percentages correctly', () => {
    // 15% of $11.00 = $1.65
    expect(calculateItemDiscount(11, { type: 'percentage', value: 15 })).toBe(1.65);
  });
});

describe('calculateOrderDiscount', () => {
  it('calculates percentage discount on subtotal', () => {
    // 10% of $50 = $5
    expect(calculateOrderDiscount(50, { type: 'percentage', value: 10 })).toBe(5);
  });

  it('calculates fixed discount on subtotal', () => {
    expect(calculateOrderDiscount(50, { type: 'fixed', value: 5 })).toBe(5);
  });

  it('caps percentage at 100%', () => {
    expect(calculateOrderDiscount(50, { type: 'percentage', value: 200 })).toBe(50);
  });

  it('caps fixed at subtotal', () => {
    expect(calculateOrderDiscount(30, { type: 'fixed', value: 50 })).toBe(30);
  });

  it('returns 0 for zero subtotal', () => {
    expect(calculateOrderDiscount(0, { type: 'fixed', value: 5 })).toBe(0);
  });
});

describe('calculateCartTotals with item discounts', () => {
  it('applies percentage item discount and reduces GST', () => {
    const result = calculateCartTotals([
      {
        unitPrice: 10,
        quantity: 1,
        isGstFree: false,
        modifiers: [],
        discount: { type: 'percentage', value: 10 },
      },
    ]);

    // $10 - 10% = $9
    expect(result.subtotal).toBe(9);
    expect(result.total).toBe(9);
    expect(result.itemDiscountTotal).toBe(1);
    // GST = 9 / 11 ≈ 0.82
    expect(result.gstAmount).toBe(0.82);
  });

  it('applies fixed item discount', () => {
    const result = calculateCartTotals([
      {
        unitPrice: 20,
        quantity: 1,
        isGstFree: false,
        modifiers: [],
        discount: { type: 'fixed', value: 5 },
      },
    ]);

    // $20 - $5 = $15
    expect(result.subtotal).toBe(15);
    expect(result.total).toBe(15);
    expect(result.itemDiscountTotal).toBe(5);
  });

  it('handles item discount on GST-free item', () => {
    const result = calculateCartTotals([
      {
        unitPrice: 10,
        quantity: 1,
        isGstFree: true,
        modifiers: [],
        discount: { type: 'fixed', value: 2 },
      },
    ]);

    expect(result.subtotal).toBe(8);
    expect(result.gstAmount).toBe(0);
    expect(result.itemDiscountTotal).toBe(2);
  });
});

describe('calculateCartTotals with order discount', () => {
  it('applies percentage order discount and proportionally reduces GST', () => {
    const result = calculateCartTotals(
      [{ unitPrice: 11, quantity: 1, isGstFree: false, modifiers: [] }],
      { type: 'percentage', value: 10 },
    );

    // Subtotal: $11, order discount: $1.10, total: $9.90
    expect(result.subtotal).toBe(11);
    expect(result.orderDiscountAmount).toBe(1.1);
    expect(result.total).toBe(9.9);
    // GST before discount: 11/11 = 1.00, after 10% reduction: 0.90
    expect(result.gstAmount).toBe(0.9);
  });

  it('applies fixed order discount', () => {
    const result = calculateCartTotals(
      [{ unitPrice: 20, quantity: 1, isGstFree: false, modifiers: [] }],
      { type: 'fixed', value: 5 },
    );

    expect(result.subtotal).toBe(20);
    expect(result.orderDiscountAmount).toBe(5);
    expect(result.total).toBe(15);
    // GST before: 20/11 ≈ 1.818, after 25% reduction: 1.818 * 0.75 ≈ 1.36
    expect(result.gstAmount).toBe(1.36);
  });

  it('combines item and order discounts', () => {
    const result = calculateCartTotals(
      [
        {
          unitPrice: 20,
          quantity: 1,
          isGstFree: false,
          modifiers: [],
          discount: { type: 'fixed', value: 5 },
        },
      ],
      { type: 'percentage', value: 10 },
    );

    // Line: $20, item discount: $5, subtotal: $15
    // Order discount: 10% of $15 = $1.50, total: $13.50
    expect(result.subtotal).toBe(15);
    expect(result.itemDiscountTotal).toBe(5);
    expect(result.orderDiscountAmount).toBe(1.5);
    expect(result.total).toBe(13.5);
    expect(result.totalDiscount).toBe(6.5);
  });

  it('backward compatible: no discount param returns same totals', () => {
    const result = calculateCartTotals([
      { unitPrice: 4.5, quantity: 1, isGstFree: false, modifiers: [] },
    ]);

    expect(result.subtotal).toBe(4.5);
    expect(result.total).toBe(4.5);
    expect(result.gstAmount).toBe(0.41);
    expect(result.itemDiscountTotal).toBe(0);
    expect(result.orderDiscountAmount).toBe(0);
    expect(result.totalDiscount).toBe(0);
  });
});

describe('calculateCartTotals with voided items', () => {
  it('excludes voided items from totals', () => {
    const result = calculateCartTotals([
      { unitPrice: 10, quantity: 1, isGstFree: false, modifiers: [] },
      { unitPrice: 5, quantity: 2, isGstFree: false, modifiers: [], voidedAt: Date.now() },
    ]);

    expect(result.subtotal).toBe(10);
    expect(result.total).toBe(10);
  });

  it('returns zeros when all items are voided', () => {
    const result = calculateCartTotals([
      { unitPrice: 10, quantity: 1, isGstFree: false, modifiers: [], voidedAt: Date.now() },
      { unitPrice: 5, quantity: 1, isGstFree: false, modifiers: [], voidedAt: Date.now() },
    ]);

    expect(result.subtotal).toBe(0);
    expect(result.gstAmount).toBe(0);
    expect(result.total).toBe(0);
  });

  it('includes items with voidedAt=0 (not voided)', () => {
    const result = calculateCartTotals([
      { unitPrice: 10, quantity: 1, isGstFree: false, modifiers: [], voidedAt: 0 },
    ]);

    expect(result.subtotal).toBe(10);
    expect(result.total).toBe(10);
  });

  it('excludes voided items with discount from totals', () => {
    const result = calculateCartTotals([
      {
        unitPrice: 20,
        quantity: 1,
        isGstFree: false,
        modifiers: [],
        discount: { type: 'fixed', value: 5 },
        voidedAt: Date.now(),
      },
      { unitPrice: 10, quantity: 1, isGstFree: false, modifiers: [] },
    ]);

    expect(result.subtotal).toBe(10);
    expect(result.total).toBe(10);
    expect(result.itemDiscountTotal).toBe(0);
  });
});

describe('calculateCartTotals with price overrides', () => {
  it('uses override price instead of unit price', () => {
    const result = calculateCartTotals([
      { unitPrice: 10, quantity: 1, isGstFree: false, modifiers: [], overridePrice: 7 },
    ]);

    // Override price $7 instead of $10
    expect(result.subtotal).toBe(7);
    expect(result.total).toBe(7);
    // GST = 7 / 11 ≈ 0.636... → 0.64
    expect(result.gstAmount).toBe(0.64);
  });

  it('applies override price with modifiers', () => {
    const result = calculateCartTotals([
      {
        unitPrice: 10,
        quantity: 1,
        isGstFree: false,
        modifiers: [{ priceAdjustment: 1.5 }],
        overridePrice: 6,
      },
    ]);

    // Override $6 + $1.50 modifier = $7.50
    expect(result.subtotal).toBe(7.5);
    expect(result.total).toBe(7.5);
  });

  it('applies override price with discount', () => {
    const result = calculateCartTotals([
      {
        unitPrice: 20,
        quantity: 1,
        isGstFree: false,
        modifiers: [],
        overridePrice: 15,
        discount: { type: 'fixed', value: 5 },
      },
    ]);

    // Override $15, discount $5 → subtotal $10
    expect(result.subtotal).toBe(10);
    expect(result.total).toBe(10);
    expect(result.itemDiscountTotal).toBe(5);
  });

  it('calculates GST on override price', () => {
    const result = calculateCartTotals([
      { unitPrice: 22, quantity: 1, isGstFree: false, modifiers: [], overridePrice: 11 },
    ]);

    // GST = 11 / 11 = 1.00
    expect(result.gstAmount).toBe(1);
  });

  it('uses original price when overridePrice is 0', () => {
    const result = calculateCartTotals([
      { unitPrice: 10, quantity: 1, isGstFree: false, modifiers: [], overridePrice: 0 },
    ]);

    expect(result.subtotal).toBe(10);
    expect(result.total).toBe(10);
  });

  it('uses original price when overridePrice is undefined', () => {
    const result = calculateCartTotals([
      { unitPrice: 10, quantity: 1, isGstFree: false, modifiers: [] },
    ]);

    expect(result.subtotal).toBe(10);
    expect(result.total).toBe(10);
  });
});

describe('requiresManagerApproval', () => {
  it('returns false for percentage within threshold', () => {
    expect(requiresManagerApproval('percentage', 20)).toBe(false);
    expect(requiresManagerApproval('percentage', 10)).toBe(false);
  });

  it('returns true for percentage exceeding threshold', () => {
    expect(requiresManagerApproval('percentage', 21)).toBe(true);
    expect(requiresManagerApproval('percentage', 50)).toBe(true);
  });

  it('returns false for fixed within threshold', () => {
    expect(requiresManagerApproval('fixed', 10)).toBe(false);
    expect(requiresManagerApproval('fixed', 5)).toBe(false);
  });

  it('returns true for fixed exceeding threshold', () => {
    expect(requiresManagerApproval('fixed', 11)).toBe(true);
    expect(requiresManagerApproval('fixed', 50)).toBe(true);
  });

  it('uses custom thresholds', () => {
    expect(requiresManagerApproval('percentage', 15, { percentageMax: 10, fixedMax: 5 })).toBe(
      true,
    );
    expect(requiresManagerApproval('fixed', 3, { percentageMax: 10, fixedMax: 5 })).toBe(false);
  });

  it('exports default thresholds', () => {
    expect(DISCOUNT_THRESHOLDS.percentageMax).toBe(20);
    expect(DISCOUNT_THRESHOLDS.fixedMax).toBe(10);
  });
});

describe('calculatePaymentTotal', () => {
  describe('cash payments', () => {
    it('rounds to nearest 5 cents — round down', () => {
      // $9.92 → $9.90
      const result = calculatePaymentTotal(9.92, 'cash');
      expect(result.payableAmount).toBe(9.9);
      expect(result.roundingAmount).toBe(-0.02);
    });

    it('rounds to nearest 5 cents — round up', () => {
      // $9.93 → $9.95
      const result = calculatePaymentTotal(9.93, 'cash');
      expect(result.payableAmount).toBe(9.95);
      expect(result.roundingAmount).toBe(0.02);
    });

    it('no rounding needed for exact 5c amount', () => {
      const result = calculatePaymentTotal(10.0, 'cash');
      expect(result.payableAmount).toBe(10.0);
      expect(result.roundingAmount).toBe(0);
    });

    it('rounds $9.91 down to $9.90', () => {
      const result = calculatePaymentTotal(9.91, 'cash');
      expect(result.payableAmount).toBe(9.9);
      expect(result.roundingAmount).toBe(-0.01);
    });

    it('rounds $9.98 up to $10.00', () => {
      const result = calculatePaymentTotal(9.98, 'cash');
      expect(result.payableAmount).toBe(10.0);
      expect(result.roundingAmount).toBe(0.02);
    });

    it('handles $0.01 rounding', () => {
      // $10.01 → $10.00
      const result = calculatePaymentTotal(10.01, 'cash');
      expect(result.payableAmount).toBe(10.0);
      expect(result.roundingAmount).toBe(-0.01);
    });

    it('handles $0.04 rounding', () => {
      // $10.04 → $10.05
      const result = calculatePaymentTotal(10.04, 'cash');
      expect(result.payableAmount).toBe(10.05);
      expect(result.roundingAmount).toBe(0.01);
    });

    it('handles zero total', () => {
      const result = calculatePaymentTotal(0, 'cash');
      expect(result.payableAmount).toBe(0);
      expect(result.roundingAmount).toBe(0);
    });
  });

  describe('card payments', () => {
    it('returns exact amount with no rounding', () => {
      const result = calculatePaymentTotal(9.92, 'card');
      expect(result.payableAmount).toBe(9.92);
      expect(result.roundingAmount).toBe(0);
    });

    it('returns exact amount for whole dollars', () => {
      const result = calculatePaymentTotal(10.0, 'card');
      expect(result.payableAmount).toBe(10.0);
      expect(result.roundingAmount).toBe(0);
    });

    it('returns exact amount for odd cents', () => {
      const result = calculatePaymentTotal(13.37, 'card');
      expect(result.payableAmount).toBe(13.37);
      expect(result.roundingAmount).toBe(0);
    });

    it('handles zero total', () => {
      const result = calculatePaymentTotal(0, 'card');
      expect(result.payableAmount).toBe(0);
      expect(result.roundingAmount).toBe(0);
    });
  });
});
