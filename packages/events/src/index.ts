// ── Event payload types ─────────────────────────────────

export interface PosOrderCompleted {
  orderId: string;
  organizationId: string;
  total: number;
  tipAmount: number;
  items: { productId: string; quantity: number; unitPrice: number }[];
  timestamp: Date;
}

export interface PosOrderSubmitted {
  orderId: string;
  organizationId: string;
  total: number;
  itemCount: number;
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

export interface PosItemVoided {
  orderId: string;
  orderItemId: string;
  organizationId: string;
  productName: string;
  originalAmount: number;
  voidReason: string;
  staffId: string;
  managerApproverId?: string;
  timestamp: Date;
}

export interface PosItemPriceOverridden {
  orderId: string;
  orderItemId: string;
  organizationId: string;
  productName: string;
  originalPrice: number;
  overridePrice: number;
  overrideReason: string;
  staffId: string;
  managerApproverId: string;
  timestamp: Date;
}

export interface ProductsAvailabilityChanged {
  productId: string;
  organizationId: string;
  isAvailable: boolean;
}

// ── Event map (event name → payload type) ───────────────

export interface EventMap {
  'pos.order.submitted': PosOrderSubmitted;
  'pos.order.completed': PosOrderCompleted;
  'pos.order.refunded': PosOrderRefunded;
  'inventory.stock.low': InventoryStockLow;
  'loyalty.tier.changed': LoyaltyTierChanged;
  'pos.item.voided': PosItemVoided;
  'pos.item.price_overridden': PosItemPriceOverridden;
  'products.availability_changed': ProductsAvailabilityChanged;
}

export type EventName = keyof EventMap;

// ── Event handler type ──────────────────────────────────

export type EventHandler<T = unknown> = (payload: T) => Promise<void>;

// ── Wildcard handler (receives event name + payload) ────

export type WildcardHandler = (eventName: EventName, payload: unknown) => Promise<void>;

// ── EventBus ────────────────────────────────────────────

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private wildcardHandlers = new Set<WildcardHandler>();

  on<K extends EventName>(eventName: K, handler: EventHandler<EventMap[K]>): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    this.handlers.get(eventName)!.add(handler as EventHandler);
  }

  off<K extends EventName>(eventName: K, handler: EventHandler<EventMap[K]>): void {
    this.handlers.get(eventName)?.delete(handler as EventHandler);
  }

  onAny(handler: WildcardHandler): void {
    this.wildcardHandlers.add(handler);
  }

  offAny(handler: WildcardHandler): void {
    this.wildcardHandlers.delete(handler);
  }

  emit<K extends EventName>(eventName: K, payload: EventMap[K]): void {
    const named = this.handlers.get(eventName);
    const tasks: Promise<void>[] = [];

    if (named) {
      for (const handler of named) {
        tasks.push(
          handler(payload).catch((err) => {
            console.error(`[EventBus] Handler error for "${eventName}":`, err);
          }),
        );
      }
    }

    for (const handler of this.wildcardHandlers) {
      tasks.push(
        handler(eventName, payload).catch((err) => {
          console.error(`[EventBus] Wildcard handler error for "${eventName}":`, err);
        }),
      );
    }

    // Fire and forget — don't await
    void Promise.allSettled(tasks);
  }

  removeAllListeners(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
  }
}

// ── Singleton ───────────────────────────────────────────

export const eventBus = new EventBus();
