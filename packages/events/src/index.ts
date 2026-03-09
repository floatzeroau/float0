export interface PosOrderCompleted {
  orderId: string;
  organizationId: string;
  total: number;
  items: { productId: string; quantity: number; unitPrice: number }[];
  timestamp: Date;
}

export interface PosOrderRefunded {
  orderId: string;
  organizationId: string;
  refundAmount: number;
  reason: string;
  timestamp: Date;
}

export interface InventoryStockLow {
  productId: string;
  organizationId: string;
  currentStock: number;
  threshold: number;
}

export interface LoyaltyTierChanged {
  customerId: string;
  organizationId: string;
  oldTier: string;
  newTier: string;
}
