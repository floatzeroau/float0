export enum OrderStatus {
  Draft = 'Draft',
  Submitted = 'Submitted',
  InProgress = 'InProgress',
  Ready = 'Ready',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
  Refunded = 'Refunded',
}

export enum OrderType {
  DineIn = 'DineIn',
  Takeaway = 'Takeaway',
}

export enum PaymentMethod {
  Cash = 'Cash',
  Card = 'Card',
  Split = 'Split',
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: string[];
  total: number;
}

export interface Payment {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  tip: number;
  paidAt: Date;
}

export interface Order {
  id: string;
  organizationId: string;
  userId: string;
  status: OrderStatus;
  type: OrderType;
  items: OrderItem[];
  payments: Payment[];
  subtotal: number;
  gst: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
}
