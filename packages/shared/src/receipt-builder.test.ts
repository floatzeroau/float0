import { describe, expect, it } from 'vitest';
import { buildReceipt } from './receipt-builder.js';
import type {
  ReceiptBusinessInfo,
  ReceiptOrderInput,
  ReceiptItemInput,
  ReceiptPaymentInput,
} from './receipt-builder.js';
import { ATO_TAX_INVOICE_THRESHOLD } from './constants.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const business: ReceiptBusinessInfo = {
  businessName: 'Test Cafe',
  abn: '12 345 678 901',
  address: '123 Main Street',
  phone: '03 9123 4567',
};

const baseOrder: ReceiptOrderInput = {
  orderNumber: '#1042',
  orderType: 'takeaway',
  subtotal: 9,
  gstAmount: 0.82,
  discountTotal: 0,
  total: 9,
  createdAt: new Date('2026-03-21T14:35:00Z').getTime(),
};

function makeItem(overrides: Partial<ReceiptItemInput> = {}): ReceiptItemInput {
  return {
    productName: 'Flat White',
    modifiers: [],
    quantity: 1,
    unitPrice: 4.5,
    lineTotal: 4.5,
    discountAmount: 0,
    isVoided: false,
    isGstFree: false,
    ...overrides,
  };
}

function makeCashPayment(overrides: Partial<ReceiptPaymentInput> = {}): ReceiptPaymentInput {
  return {
    method: 'cash',
    amount: 9,
    tipAmount: 0,
    ...overrides,
  };
}

function makeCardPayment(overrides: Partial<ReceiptPaymentInput> = {}): ReceiptPaymentInput {
  return {
    method: 'card',
    amount: 9,
    tipAmount: 0,
    cardType: 'Visa',
    lastFour: '4242',
    approvalCode: 'MOCK-ABC123',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildReceipt', () => {
  it('builds a basic cash order with 2 items', () => {
    const items = [makeItem(), makeItem()];
    const payments = [makeCashPayment()];

    const receipt = buildReceipt(business, baseOrder, items, payments, 'Alex');

    expect(receipt.businessName).toBe('Test Cafe');
    expect(receipt.abn).toBe('12 345 678 901');
    expect(receipt.address).toBe('123 Main Street');
    expect(receipt.phone).toBe('03 9123 4567');
    expect(receipt.dateTime).toBe('2026-03-21T14:35:00.000Z');
    expect(receipt.orderNumber).toBe('#1042');
    expect(receipt.staffName).toBe('Alex');
    expect(receipt.orderType).toBe('takeaway');
    expect(receipt.items).toHaveLength(2);
    expect(receipt.items[0].name).toBe('Flat White');
    expect(receipt.subtotal).toBe(9);
    expect(receipt.gstAmount).toBe(0.82);
    expect(receipt.total).toBe(9);
    expect(receipt.payments).toHaveLength(1);
    expect(receipt.payments[0].method).toBe('cash');
    expect(receipt.tipAmount).toBe(0);
  });

  it('passes through item discount amount', () => {
    const items = [makeItem({ discountAmount: 1.5, lineTotal: 3 })];
    const payments = [makeCashPayment({ amount: 3 })];
    const order = { ...baseOrder, subtotal: 3, total: 3, discountTotal: 1.5 };

    const receipt = buildReceipt(business, order, items, payments, 'Alex');

    expect(receipt.items[0].discountAmount).toBe(1.5);
    expect(receipt.discountTotal).toBe(1.5);
  });

  it('includes voided items with isVoided flag', () => {
    const items = [makeItem(), makeItem({ isVoided: true, productName: 'Banana Bread' })];
    const payments = [makeCashPayment({ amount: 4.5 })];

    const receipt = buildReceipt(business, baseOrder, items, payments, 'Alex');

    expect(receipt.items).toHaveLength(2);
    expect(receipt.items[0].isVoided).toBe(false);
    expect(receipt.items[1].isVoided).toBe(true);
    expect(receipt.items[1].name).toBe('Banana Bread');
  });

  it('includes card payment details', () => {
    const items = [makeItem()];
    const payments = [makeCardPayment()];

    const receipt = buildReceipt(business, baseOrder, items, payments, 'Alex');

    expect(receipt.payments[0].method).toBe('card');
    expect(receipt.payments[0].cardType).toBe('Visa');
    expect(receipt.payments[0].lastFour).toBe('4242');
    expect(receipt.payments[0].approvalCode).toBe('MOCK-ABC123');
  });

  it('handles split payments and sums tip across payments', () => {
    const items = [makeItem({ lineTotal: 10, unitPrice: 10 })];
    const payments = [
      makeCashPayment({ amount: 5, tipAmount: 1 }),
      makeCardPayment({ amount: 5, tipAmount: 2 }),
    ];
    const order = { ...baseOrder, subtotal: 10, total: 10 };

    const receipt = buildReceipt(business, order, items, payments, 'Alex');

    expect(receipt.payments).toHaveLength(2);
    expect(receipt.payments[0].method).toBe('cash');
    expect(receipt.payments[1].method).toBe('card');
    expect(receipt.tipAmount).toBe(3);
  });

  it('marks GST-free items', () => {
    const items = [makeItem({ isGstFree: true, productName: 'Fresh Bread' })];
    const payments = [makeCashPayment()];

    const receipt = buildReceipt(business, baseOrder, items, payments, 'Alex');

    expect(receipt.items[0].isGstFree).toBe(true);
  });

  it('includes cash rounding amount on payment', () => {
    const items = [makeItem()];
    const payments = [makeCashPayment({ roundingAmount: -0.02 })];

    const receipt = buildReceipt(business, baseOrder, items, payments, 'Alex');

    expect(receipt.payments[0].roundingAmount).toBe(-0.02);
  });

  it('includes tendered amount and change for cash payments', () => {
    const items = [makeItem()];
    const payments = [makeCashPayment({ tenderedAmount: 20, changeGiven: 11 })];

    const receipt = buildReceipt(business, baseOrder, items, payments, 'Alex');

    expect(receipt.payments[0].tenderedAmount).toBe(20);
    expect(receipt.payments[0].changeGiven).toBe(11);
  });

  it('includes dine-in table number', () => {
    const order = { ...baseOrder, orderType: 'dine_in' as const, tableNumber: '5' };
    const items = [makeItem()];
    const payments = [makeCashPayment()];

    const receipt = buildReceipt(business, order, items, payments, 'Alex');

    expect(receipt.orderType).toBe('dine_in');
    expect(receipt.tableNumber).toBe('5');
  });

  it('includes customer name when present', () => {
    const order = { ...baseOrder, customerName: 'Jane Smith' };
    const items = [makeItem()];
    const payments = [makeCashPayment()];

    const receipt = buildReceipt(business, order, items, payments, 'Alex');

    expect(receipt.customerName).toBe('Jane Smith');
  });

  it('omits optional fields when not provided', () => {
    const items = [makeItem()];
    const payments = [makeCashPayment()];

    const receipt = buildReceipt(business, baseOrder, items, payments, 'Alex');

    expect(receipt.tableNumber).toBeUndefined();
    expect(receipt.customerName).toBeUndefined();
    expect(receipt.payments[0].cardType).toBeUndefined();
    expect(receipt.payments[0].approvalCode).toBeUndefined();
  });

  it('maps item modifiers correctly', () => {
    const items = [makeItem({ modifiers: ['Extra Shot', 'Oat Milk'] })];
    const payments = [makeCashPayment()];

    const receipt = buildReceipt(business, baseOrder, items, payments, 'Alex');

    expect(receipt.items[0].modifiers).toEqual(['Extra Shot', 'Oat Milk']);
  });

  // -------------------------------------------------------------------------
  // ATO tax invoice formatting
  // -------------------------------------------------------------------------

  it('marks order below threshold as simplified', () => {
    const order = { ...baseOrder, total: 50, subtotal: 50, gstAmount: 4.55 };
    const items = [makeItem({ unitPrice: 50, lineTotal: 50 })];
    const payments = [makeCashPayment({ amount: 50 })];

    const receipt = buildReceipt(business, order, items, payments, 'Alex');

    expect(receipt.invoiceType).toBe('simplified');
  });

  it('marks order at threshold as full_tax_invoice', () => {
    const order = {
      ...baseOrder,
      total: ATO_TAX_INVOICE_THRESHOLD,
      subtotal: ATO_TAX_INVOICE_THRESHOLD,
      gstAmount: 7.5,
    };
    const items = [
      makeItem({ unitPrice: ATO_TAX_INVOICE_THRESHOLD, lineTotal: ATO_TAX_INVOICE_THRESHOLD }),
    ];
    const payments = [makeCashPayment({ amount: ATO_TAX_INVOICE_THRESHOLD })];

    const receipt = buildReceipt(business, order, items, payments, 'Alex');

    expect(receipt.invoiceType).toBe('full_tax_invoice');
  });

  it('marks order above threshold as full_tax_invoice', () => {
    const order = { ...baseOrder, total: 100, subtotal: 100, gstAmount: 9.09 };
    const items = [makeItem({ unitPrice: 100, lineTotal: 100 })];
    const payments = [makeCashPayment({ amount: 100 })];

    const receipt = buildReceipt(business, order, items, payments, 'Alex');

    expect(receipt.invoiceType).toBe('full_tax_invoice');
  });

  it('full tax invoice includes customer name when provided', () => {
    const order = {
      ...baseOrder,
      total: 100,
      subtotal: 100,
      gstAmount: 9.09,
      customerName: 'Jane Smith',
    };
    const items = [makeItem({ unitPrice: 100, lineTotal: 100 })];
    const payments = [makeCashPayment({ amount: 100 })];

    const receipt = buildReceipt(business, order, items, payments, 'Alex');

    expect(receipt.invoiceType).toBe('full_tax_invoice');
    expect(receipt.customerName).toBe('Jane Smith');
  });
});
