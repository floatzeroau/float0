import { describe, expect, it } from 'vitest';
import { calculateLineTotal, calculateCartTotals } from './cart-calculator.js';

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
});
