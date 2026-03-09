import { describe, expect, it } from 'vitest';
import { calculateGST, roundToFiveCents, toMinorUnits, toDisplayAmount } from './money.js';

describe('calculateGST', () => {
  it('calculates GST for $4.50', () => {
    expect(calculateGST(4.5)).toBeCloseTo(0.4090909, 5);
  });

  it('returns 0 for $0', () => {
    expect(calculateGST(0)).toBe(0);
  });

  it('calculates GST for $100', () => {
    expect(calculateGST(100)).toBeCloseTo(9.0909090, 5);
  });
});

describe('roundToFiveCents', () => {
  it('rounds $4.51 down to $4.50', () => {
    expect(roundToFiveCents(4.51)).toBe(4.50);
  });

  it('rounds $4.52 down to $4.50', () => {
    expect(roundToFiveCents(4.52)).toBe(4.50);
  });

  it('rounds $4.53 up to $4.55', () => {
    expect(roundToFiveCents(4.53)).toBe(4.55);
  });

  it('rounds $4.54 up to $4.55', () => {
    expect(roundToFiveCents(4.54)).toBe(4.55);
  });

  it('rounds $4.56 down to $4.55', () => {
    expect(roundToFiveCents(4.56)).toBe(4.55);
  });

  it('rounds $4.57 down to $4.55', () => {
    expect(roundToFiveCents(4.57)).toBe(4.55);
  });

  it('rounds $4.58 up to $4.60', () => {
    expect(roundToFiveCents(4.58)).toBe(4.60);
  });

  it('rounds $4.59 up to $4.60', () => {
    expect(roundToFiveCents(4.59)).toBe(4.60);
  });
});

describe('toMinorUnits / toDisplayAmount round-trip', () => {
  it('round-trips $4.50', () => {
    const cents = toMinorUnits(4.50);
    expect(cents).toBe(450);
    expect(toDisplayAmount(cents)).toBe('$4.50');
  });

  it('round-trips $0.00', () => {
    const cents = toMinorUnits(0);
    expect(cents).toBe(0);
    expect(toDisplayAmount(cents)).toBe('$0.00');
  });

  it('round-trips $100.99', () => {
    const cents = toMinorUnits(100.99);
    expect(cents).toBe(10099);
    expect(toDisplayAmount(cents)).toBe('$100.99');
  });

  it('round-trips $0.01', () => {
    const cents = toMinorUnits(0.01);
    expect(cents).toBe(1);
    expect(toDisplayAmount(cents)).toBe('$0.01');
  });
});
