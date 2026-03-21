import { describe, expect, it } from 'vitest';
import { buildKitchenDocket, buildModificationDocket } from './docket-builder.js';
import type { DocketOrderInput, DocketItemInput } from './docket-builder.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseOrder: DocketOrderInput = {
  orderNumber: '#1042',
  orderType: 'takeaway',
  createdAt: new Date('2026-03-21T14:35:00Z').getTime(),
};

function makeItem(overrides: Partial<DocketItemInput> = {}): DocketItemInput {
  return {
    productName: 'Flat White',
    modifiers: [],
    quantity: 1,
    notes: '',
    isVoided: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildKitchenDocket
// ---------------------------------------------------------------------------

describe('buildKitchenDocket', () => {
  it('maps all non-voided items with no tags and isModification false', () => {
    const items = [makeItem(), makeItem({ productName: 'Banana Bread', quantity: 2 })];
    const docket = buildKitchenDocket(baseOrder, items);

    expect(docket.orderNumber).toBe('#1042');
    expect(docket.orderType).toBe('takeaway');
    expect(docket.isModification).toBe(false);
    expect(docket.items).toHaveLength(2);
    expect(docket.items[0]).toEqual({
      name: 'Flat White',
      modifiers: [],
      quantity: 1,
      notes: '',
    });
    expect(docket.items[1]).toEqual({
      name: 'Banana Bread',
      modifiers: [],
      quantity: 2,
      notes: '',
    });
    // No tags on initial docket
    expect(docket.items[0]).not.toHaveProperty('tag');
    expect(docket.items[1]).not.toHaveProperty('tag');
  });

  it('maps modifiers correctly', () => {
    const items = [makeItem({ modifiers: ['Extra Shot', 'Oat Milk'] })];
    const docket = buildKitchenDocket(baseOrder, items);

    expect(docket.items[0].modifiers).toEqual(['Extra Shot', 'Oat Milk']);
  });

  it('maps notes correctly', () => {
    const items = [makeItem({ notes: 'Extra hot' })];
    const docket = buildKitchenDocket(baseOrder, items);

    expect(docket.items[0].notes).toBe('Extra hot');
  });

  it('excludes voided items', () => {
    const items = [makeItem(), makeItem({ productName: 'Muffin', isVoided: true })];
    const docket = buildKitchenDocket(baseOrder, items);

    expect(docket.items).toHaveLength(1);
    expect(docket.items[0].name).toBe('Flat White');
  });

  it('includes table number for dine-in orders', () => {
    const order: DocketOrderInput = { ...baseOrder, orderType: 'dine_in', tableNumber: '5' };
    const docket = buildKitchenDocket(order, [makeItem()]);

    expect(docket.orderType).toBe('dine_in');
    expect(docket.tableNumber).toBe('5');
  });

  it('omits table number for takeaway orders', () => {
    const docket = buildKitchenDocket(baseOrder, [makeItem()]);

    expect(docket.orderType).toBe('takeaway');
    expect(docket.tableNumber).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildModificationDocket
// ---------------------------------------------------------------------------

describe('buildModificationDocket', () => {
  it('tags new items as ADD', () => {
    const newItems = [makeItem({ productName: 'Cappuccino' })];
    const docket = buildModificationDocket(baseOrder, newItems, []);

    expect(docket).not.toBeNull();
    expect(docket!.isModification).toBe(true);
    expect(docket!.items).toHaveLength(1);
    expect(docket!.items[0].tag).toBe('ADD');
    expect(docket!.items[0].name).toBe('Cappuccino');
  });

  it('tags voided items as VOID', () => {
    const voidedItems = [makeItem({ productName: 'Flat White', isVoided: true })];
    const docket = buildModificationDocket(baseOrder, [], voidedItems);

    expect(docket).not.toBeNull();
    expect(docket!.isModification).toBe(true);
    expect(docket!.items).toHaveLength(1);
    expect(docket!.items[0].tag).toBe('VOID');
    expect(docket!.items[0].name).toBe('Flat White');
  });

  it('handles mixed ADD and VOID items', () => {
    const newItems = [makeItem({ productName: 'Cappuccino' })];
    const voidedItems = [makeItem({ productName: 'Flat White' })];
    const docket = buildModificationDocket(baseOrder, newItems, voidedItems);

    expect(docket).not.toBeNull();
    expect(docket!.items).toHaveLength(2);
    expect(docket!.items[0].tag).toBe('ADD');
    expect(docket!.items[0].name).toBe('Cappuccino');
    expect(docket!.items[1].tag).toBe('VOID');
    expect(docket!.items[1].name).toBe('Flat White');
  });

  it('returns null when no changes', () => {
    const docket = buildModificationDocket(baseOrder, [], []);
    expect(docket).toBeNull();
  });

  it('includes table number for dine-in modifications', () => {
    const order: DocketOrderInput = { ...baseOrder, orderType: 'dine_in', tableNumber: '12' };
    const docket = buildModificationDocket(order, [makeItem()], []);

    expect(docket!.tableNumber).toBe('12');
  });

  it('omits table number for takeaway modifications', () => {
    const docket = buildModificationDocket(baseOrder, [makeItem()], []);

    expect(docket!.tableNumber).toBeUndefined();
  });
});
