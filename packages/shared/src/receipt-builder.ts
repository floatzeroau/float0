import { ATO_TAX_INVOICE_THRESHOLD } from './constants.js';
import type { OrgReceiptSettings } from './types/base.js';

// ---------------------------------------------------------------------------
// Receipt Data Model & Builder
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Input types (what callers provide)
// ---------------------------------------------------------------------------

export interface ReceiptBusinessInfo {
  businessName: string;
  abn: string;
  address: string;
  phone: string;
  receiptSettings?: OrgReceiptSettings;
}

export interface ReceiptOrderInput {
  orderNumber: string;
  orderType: 'takeaway' | 'dine_in';
  tableNumber?: string;
  subtotal: number;
  gstAmount: number;
  discountTotal: number;
  total: number;
  createdAt: number; // epoch ms
  customerName?: string;
}

export interface ReceiptItemInput {
  productName: string;
  modifiers: string[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discountAmount: number;
  isVoided: boolean;
  isGstFree: boolean;
}

export interface ReceiptPaymentInput {
  method: 'cash' | 'card';
  amount: number;
  tipAmount: number;
  tenderedAmount?: number;
  changeGiven?: number;
  roundingAmount?: number;
  cardType?: string;
  lastFour?: string;
  approvalCode?: string;
}

// ---------------------------------------------------------------------------
// Output types (receipt data)
// ---------------------------------------------------------------------------

export interface ReceiptItem {
  name: string;
  modifiers: string[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discountAmount: number;
  isVoided: boolean;
  isGstFree: boolean;
}

export interface ReceiptPayment {
  method: 'cash' | 'card';
  amount: number;
  tipAmount: number;
  tenderedAmount?: number;
  changeGiven?: number;
  roundingAmount?: number;
  cardType?: string;
  lastFour?: string;
  approvalCode?: string;
}

export type InvoiceType = 'simplified' | 'full_tax_invoice';

export interface ReceiptData {
  businessName: string;
  abn: string;
  address: string;
  phone: string;
  dateTime: string; // ISO-8601
  orderNumber: string;
  staffName: string;
  orderType: 'takeaway' | 'dine_in';
  tableNumber?: string;
  items: ReceiptItem[];
  subtotal: number;
  discountTotal: number;
  gstAmount: number;
  total: number;
  payments: ReceiptPayment[];
  tipAmount: number;
  customerName?: string;
  invoiceType: InvoiceType;
  headerText?: string;
  footerText?: string;
  socialMedia?: string;
  logoUrl?: string;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildReceipt(
  business: ReceiptBusinessInfo,
  order: ReceiptOrderInput,
  items: ReceiptItemInput[],
  payments: ReceiptPaymentInput[],
  staffName: string,
): ReceiptData {
  const receiptItems: ReceiptItem[] = items.map((item) => ({
    name: item.productName,
    modifiers: item.modifiers,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    discountAmount: item.discountAmount,
    isVoided: item.isVoided,
    isGstFree: item.isGstFree,
  }));

  const receiptPayments: ReceiptPayment[] = payments.map((p) => ({
    method: p.method,
    amount: p.amount,
    tipAmount: p.tipAmount,
    ...(p.tenderedAmount != null && { tenderedAmount: p.tenderedAmount }),
    ...(p.changeGiven != null && { changeGiven: p.changeGiven }),
    ...(p.roundingAmount != null && { roundingAmount: p.roundingAmount }),
    ...(p.cardType && { cardType: p.cardType }),
    ...(p.lastFour && { lastFour: p.lastFour }),
    ...(p.approvalCode && { approvalCode: p.approvalCode }),
  }));

  const tipAmount = payments.reduce((sum, p) => sum + p.tipAmount, 0);

  const invoiceType: InvoiceType =
    order.total >= ATO_TAX_INVOICE_THRESHOLD ? 'full_tax_invoice' : 'simplified';

  const rs = business.receiptSettings;

  return {
    businessName: business.businessName,
    abn: business.abn,
    address: business.address,
    phone: business.phone,
    dateTime: new Date(order.createdAt).toISOString(),
    orderNumber: order.orderNumber,
    staffName,
    orderType: order.orderType,
    ...(order.tableNumber && { tableNumber: order.tableNumber }),
    items: receiptItems,
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    gstAmount: order.gstAmount,
    total: order.total,
    payments: receiptPayments,
    tipAmount,
    ...(order.customerName && { customerName: order.customerName }),
    invoiceType,
    ...(rs?.headerText && { headerText: rs.headerText }),
    ...(rs?.footerText && { footerText: rs.footerText }),
    ...(rs?.socialMedia && { socialMedia: rs.socialMedia }),
    ...(rs?.logoUrl && { logoUrl: rs.logoUrl }),
  };
}
