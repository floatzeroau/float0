import { describe, it, expect } from 'vitest';

// ── Pricing logic unit tests ─────────────────────────
// These test the same pricing formulas used in customer-balances.service.ts

function calculatePricePaid(
  perItemValue: number,
  count: number,
  discountType?: 'percentage' | 'fixed' | null,
  discountValue?: number | null,
): number {
  const subtotal = perItemValue * count;
  let pricePaid = subtotal;

  if (discountType === 'percentage' && discountValue) {
    pricePaid = subtotal * (1 - discountValue / 100);
  } else if (discountType === 'fixed' && discountValue) {
    pricePaid = subtotal - discountValue;
  }

  if (pricePaid < 0) pricePaid = 0;
  return pricePaid;
}

function resolveCount(packSize: number, allowCustomSize: boolean, customCount?: number): number {
  return allowCustomSize && customCount ? customCount : packSize;
}

function canRedeem(remainingCount: number, quantity: number): boolean {
  return remainingCount >= quantity;
}

function adjustedBalance(remainingCount: number, adjustQuantity: number): number | null {
  const result = remainingCount + adjustQuantity;
  return result < 0 ? null : result;
}

describe('Prepaid Pack Pricing', () => {
  it('standard pack: perItemValue × packSize', () => {
    // 10-pack at $5 per item = $50
    expect(calculatePricePaid(5, 10)).toBe(50);
  });

  it('pack with set price (price < perItemValue × packSize = savings)', () => {
    // Pack price is $40 but perItemValue × 10 = $50 → savings = $10
    const perItemValue = 5;
    const packSize = 10;
    const packPrice = 40;
    const savings = perItemValue * packSize - packPrice;
    expect(savings).toBe(10);
  });

  it('custom count pricing: perItemValue × customCount', () => {
    expect(calculatePricePaid(5, 7)).toBe(35);
  });

  it('percentage discount: subtotal × (1 - discount/100)', () => {
    // 10 items at $5 = $50, 20% off = $40
    expect(calculatePricePaid(5, 10, 'percentage', 20)).toBe(40);
  });

  it('fixed discount: subtotal - discountValue', () => {
    // 10 items at $5 = $50, $15 off = $35
    expect(calculatePricePaid(5, 10, 'fixed', 15)).toBe(35);
  });

  it('100% discount floors at 0', () => {
    expect(calculatePricePaid(5, 10, 'percentage', 100)).toBe(0);
  });

  it('fixed discount larger than subtotal floors at 0', () => {
    expect(calculatePricePaid(5, 2, 'fixed', 50)).toBe(0);
  });

  it('no discount when discountType is null', () => {
    expect(calculatePricePaid(5, 10, null, 20)).toBe(50);
  });

  it('no discount when discountValue is null', () => {
    expect(calculatePricePaid(5, 10, 'percentage', null)).toBe(50);
  });
});

describe('Count Resolution', () => {
  it('uses packSize when allowCustomSize is false', () => {
    expect(resolveCount(10, false, 7)).toBe(10);
  });

  it('uses packSize when allowCustomSize is true but no customCount', () => {
    expect(resolveCount(10, true)).toBe(10);
  });

  it('uses customCount when allowCustomSize is true and customCount given', () => {
    expect(resolveCount(10, true, 7)).toBe(7);
  });
});

describe('Redeem Validation', () => {
  it('allows redeem when sufficient balance', () => {
    expect(canRedeem(5, 3)).toBe(true);
  });

  it('allows redeem of exact remaining count', () => {
    expect(canRedeem(3, 3)).toBe(true);
  });

  it('rejects redeem when insufficient balance', () => {
    expect(canRedeem(2, 3)).toBe(false);
  });

  it('rejects redeem when balance is 0', () => {
    expect(canRedeem(0, 1)).toBe(false);
  });
});

describe('Admin Adjust Validation', () => {
  it('positive adjustment increases balance', () => {
    expect(adjustedBalance(5, 3)).toBe(8);
  });

  it('negative adjustment decreases balance', () => {
    expect(adjustedBalance(5, -3)).toBe(2);
  });

  it('adjustment to exactly 0 is allowed', () => {
    expect(adjustedBalance(5, -5)).toBe(0);
  });

  it('adjustment below 0 returns null (rejected)', () => {
    expect(adjustedBalance(3, -5)).toBeNull();
  });

  it('adjustment from 0 balance upward is allowed', () => {
    expect(adjustedBalance(0, 5)).toBe(5);
  });
});

describe('Refund Restoration', () => {
  it('restoring a redemption adds quantity back', () => {
    const redeemQty = -3; // stored as negative
    const restoreQty = Math.abs(redeemQty);
    const remaining = 2;
    expect(remaining + restoreQty).toBe(5);
  });
});

describe('Eligible Product Filtering', () => {
  it('null eligibleProductIds means any product', () => {
    const eligibleProductIds: string[] | null = null;
    const productId = 'abc-123';
    const isEligible = eligibleProductIds === null || eligibleProductIds.includes(productId);
    expect(isEligible).toBe(true);
  });

  it('product in list is eligible', () => {
    const eligibleProductIds = ['abc-123', 'def-456'];
    const productId = 'abc-123';
    const isEligible = eligibleProductIds.includes(productId);
    expect(isEligible).toBe(true);
  });

  it('product not in list is ineligible', () => {
    const eligibleProductIds = ['abc-123', 'def-456'];
    const productId = 'ghi-789';
    const isEligible = eligibleProductIds.includes(productId);
    expect(isEligible).toBe(false);
  });

  it('empty array means no products eligible', () => {
    const eligibleProductIds: string[] = [];
    const productId = 'abc-123';
    const isEligible = eligibleProductIds.includes(productId);
    expect(isEligible).toBe(false);
  });
});
