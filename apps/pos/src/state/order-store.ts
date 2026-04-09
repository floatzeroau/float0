import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import * as SecureStore from 'expo-secure-store';
import { database } from '../db/database';
import type { Order, OrderItem, Product, Customer, AuditLog, Payment } from '../db/models';
import { STAFF_ID_KEY } from '../config';
import {
  calculateLineTotal,
  calculateCartTotals,
  calculateItemDiscount,
  buildReceipt,
  buildKitchenDocket,
  buildModificationDocket,
} from '@float0/shared';
import type {
  DiscountType,
  OrderDiscount,
  ReceiptData,
  ReceiptItemInput,
  ReceiptPaymentInput,
  KitchenDocketData,
} from '@float0/shared';
import { eventBus } from '@float0/events';
import { transitionOrder } from './order-lifecycle';
import { getPrinterService } from '../services';
import { onPaymentCompleted } from '../sync/payment-sync-hook';
import type { OrderStatusDB } from './order-lifecycle';
import { generateUUID } from '../utils/uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrderType = 'takeaway' | 'dine_in';

export interface CurrentOrder {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  tableNumber: string | null;
  itemCount: number;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  status: OrderStatusDB;
}

export interface CartItemData {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  modifiers: { id: string; name: string; priceAdjustment: number }[];
  lineTotal: number;
  notes: string;
  isGstFree: boolean;
  discountAmount: number;
  discountType: DiscountType | null;
  discountValue: number;
  discountReason: string;
  voidedAt: number;
  voidReason: string;
  overridePrice: number;
  overrideReason: string;
}

export interface CartTotalsData {
  subtotal: number;
  gstAmount: number;
  total: number;
  itemDiscountTotal: number;
  orderDiscountAmount: number;
  totalDiscount: number;
}

export interface OrderDiscountData {
  type: DiscountType;
  value: number;
  reason: string;
}

interface AddItemParams {
  productId: string;
  productName: string;
  basePrice: number;
  isGstFree: boolean;
  selectedModifiers: { id: string; name: string; priceAdjustment: number }[];
  quantity: number;
  lineTotal: number;
}

export interface HeldOrderSummary {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  tableNumber: string | null;
  customerName: string | null;
  itemCount: number;
  total: number;
  heldAt: number; // timestamp ms
}

export interface CashPaymentParams {
  method: 'cash';
  amount: number;
  tipAmount: number;
  tenderedAmount: number;
  changeGiven: number;
  roundingAmount: number;
}

export interface CardPaymentParams {
  method: 'card';
  amount: number;
  tipAmount: number;
  approvalCode: string;
  cardType: string;
  lastFour: string;
}

export type CompletePaymentParams = CashPaymentParams | CardPaymentParams;

export interface RefundParams {
  orderId: string;
  refundAmount: number;
  reason: string;
  refundMethod: 'cash' | 'card';
  managerApprover: string;
  isFullRefund: boolean;
  refundedItemIds?: string[];
  approvalCode?: string;
  cardType?: string;
  cardLastFour?: string;
}

const MAX_HELD_ORDERS = 20;
const HELD_ORDER_WARNING_THRESHOLD = 15;
export const VOID_THRESHOLD_AMOUNT = 10;

interface OrderStoreValue {
  currentOrder: CurrentOrder | null;
  createNewOrder: () => Promise<void>;
  setOrderType: (type: OrderType) => void;
  setTableNumber: (num: string | null) => void;
  items: CartItemData[];
  cartTotals: CartTotalsData;
  addItem: (params: AddItemParams) => Promise<void>;
  updateItemQuantity: (itemId: string, newQuantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  updateItemModifiers: (
    itemId: string,
    modifiers: { id: string; name: string; priceAdjustment: number }[],
    newLineTotal: number,
  ) => Promise<void>;
  addItemNote: (itemId: string, note: string) => Promise<void>;
  setCustomer: (customerId: string | null) => Promise<void>;
  submitOrder: () => Promise<void>;
  cancelOrder: (reason: string) => Promise<void>;
  holdOrder: () => Promise<void>;
  recallOrder: (orderId: string) => Promise<void>;
  heldOrders: HeldOrderSummary[];
  refreshHeldOrders: () => Promise<void>;
  orderDiscount: OrderDiscountData | null;
  applyOrderDiscount: (type: DiscountType, value: number, reason: string) => Promise<void>;
  applyItemDiscount: (
    itemId: string,
    type: DiscountType,
    value: number,
    reason: string,
  ) => Promise<void>;
  removeOrderDiscount: () => Promise<void>;
  removeItemDiscount: (itemId: string) => Promise<void>;
  isManagingSubmittedOrder: boolean;
  loadSubmittedOrder: (orderId: string) => Promise<void>;
  addItemToSubmittedOrder: (params: AddItemParams) => Promise<void>;
  voidItem: (itemId: string, reason: string, managerApprover?: string) => Promise<void>;
  overrideItemPrice: (
    itemId: string,
    newPrice: number,
    reason: string,
    managerApprover: string,
  ) => Promise<void>;
  removeItemPriceOverride: (itemId: string) => Promise<void>;
  returnToNewOrder: () => Promise<void>;
  completePayment: (params: CompletePaymentParams) => Promise<ReceiptData | undefined>;
  recordPartialPayment: (params: CompletePaymentParams) => Promise<void>;
  refundOrder: (params: RefundParams) => Promise<void>;
  lastDocket: KitchenDocketData | null;
  clearLastDocket: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStartOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function setRaw(
  record: Order | OrderItem | AuditLog | Payment,
  field: string,
  value: string | number,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (record._raw as any)[field] = value;
}

async function getNextOrderNumber(): Promise<string> {
  const startOfDay = getStartOfDay();

  const todayOrders = await database
    .get<Order>('orders')
    .query(Q.where('created_at', Q.gte(startOfDay.getTime())))
    .fetch();

  let maxNum = 0;
  for (const order of todayOrders) {
    const match = order.orderNumber.match(/^#?(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  const next = maxNum + 1;
  return `#${String(next).padStart(3, '0')}`;
}

const ZERO_TOTALS: CartTotalsData = {
  subtotal: 0,
  gstAmount: 0,
  total: 0,
  itemDiscountTotal: 0,
  orderDiscountAmount: 0,
  totalDiscount: 0,
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const OrderContext = createContext<OrderStoreValue>({
  currentOrder: null,
  createNewOrder: async () => {},
  setOrderType: () => {},
  setTableNumber: () => {},
  items: [],
  cartTotals: ZERO_TOTALS,
  addItem: async () => {},
  updateItemQuantity: async () => {},
  removeItem: async () => {},
  updateItemModifiers: async () => {},
  addItemNote: async () => {},
  setCustomer: async () => {},
  submitOrder: async () => {},
  cancelOrder: async () => {},
  holdOrder: async () => {},
  recallOrder: async () => {},
  heldOrders: [],
  refreshHeldOrders: async () => {},
  orderDiscount: null,
  applyOrderDiscount: async () => {},
  applyItemDiscount: async () => {},
  removeOrderDiscount: async () => {},
  removeItemDiscount: async () => {},
  isManagingSubmittedOrder: false,
  loadSubmittedOrder: async () => {},
  addItemToSubmittedOrder: async () => {},
  voidItem: async () => {},
  overrideItemPrice: async () => {},
  removeItemPriceOverride: async () => {},
  returnToNewOrder: async () => {},
  completePayment: async () => undefined,
  recordPartialPayment: async () => {},
  refundOrder: async () => {},
  lastDocket: null,
  clearLastDocket: () => {},
});

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [currentOrder, setCurrentOrder] = useState<CurrentOrder | null>(null);
  const [items, setItems] = useState<CartItemData[]>([]);
  const [cartTotals, setCartTotals] = useState<CartTotalsData>(ZERO_TOTALS);
  const [heldOrders, setHeldOrders] = useState<HeldOrderSummary[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<OrderDiscountData | null>(null);
  const [isManagingSubmittedOrder, setIsManagingSubmittedOrder] = useState(false);
  const [lastDocket, setLastDocket] = useState<KitchenDocketData | null>(null);
  const orderRecordIdRef = useRef<string | null>(null);
  const submittedItemsSnapshotRef = useRef<{ id: string; voidedAt: number }[]>([]);

  const clearLastDocket = useCallback(() => {
    setLastDocket(null);
  }, []);

  // -------------------------------------------------------------------------
  // refreshItems — reload items from DB & recalculate totals
  // -------------------------------------------------------------------------
  const refreshItems = useCallback(
    async (orderId: string, currentOrderDiscount?: OrderDiscountData | null) => {
      const orderItems = await database
        .get<OrderItem>('order_items')
        .query(Q.where('order_id', orderId))
        .fetch();

      const loaded: CartItemData[] = await Promise.all(
        orderItems.map(async (oi) => {
          let productName = '';
          let isGstFree = false;
          try {
            const product = await database.get<Product>('products').find(oi.productId);
            productName = product.name;
            isGstFree = product.isGstFree;
          } catch {
            productName = 'Unknown';
          }

          const modifiers: CartItemData['modifiers'] = Array.isArray(oi.modifiersJson)
            ? oi.modifiersJson
            : [];

          // Read discount fields from raw record
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw = (oi as any)._raw;
          const discountType = raw.discount_type || null;
          const discountValue = raw.discount_value || 0;
          const discountAmount = raw.discount_amount || 0;
          const discountReason = raw.discount_reason || '';
          const voidedAt = raw.voided_at || 0;
          const voidReason = raw.void_reason || '';
          const overridePrice = raw.override_price || 0;
          const overrideReason = raw.override_reason || '';

          return {
            id: oi.id,
            productId: oi.productId,
            productName,
            unitPrice: oi.unitPrice,
            quantity: oi.quantity,
            modifiers,
            lineTotal: oi.lineTotal,
            notes: oi.notes ?? '',
            isGstFree,
            discountAmount,
            discountType: discountType as DiscountType | null,
            discountValue,
            discountReason,
            voidedAt,
            voidReason,
            overridePrice,
            overrideReason,
          };
        }),
      );

      setItems(loaded);

      // Use passed discount or fall back to state via ref
      const discountToApply = currentOrderDiscount !== undefined ? currentOrderDiscount : null;
      const orderDiscountParam: OrderDiscount | undefined =
        discountToApply && discountToApply.value > 0
          ? { type: discountToApply.type, value: discountToApply.value }
          : undefined;

      const totals = calculateCartTotals(
        loaded.map((item) => ({
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          isGstFree: item.isGstFree,
          modifiers: item.modifiers.map((m) => ({ priceAdjustment: m.priceAdjustment })),
          discount:
            item.discountType && item.discountValue > 0
              ? { type: item.discountType, value: item.discountValue }
              : undefined,
          voidedAt: item.voidedAt,
          overridePrice: item.overridePrice,
        })),
        orderDiscountParam,
      );
      setCartTotals(totals);

      // Persist totals to order record
      try {
        await database.write(async () => {
          const record = await database.get<Order>('orders').find(orderId);
          await record.update((o) => {
            setRaw(o, 'subtotal', totals.subtotal);
            setRaw(o, 'gst', totals.gstAmount);
            setRaw(o, 'total', totals.total);
            setRaw(o, 'discount_amount', totals.totalDiscount);
          });
        });
      } catch {
        // Order may have been deleted
      }

      // Update item count in state (exclude voided items)
      setCurrentOrder((prev) => {
        if (!prev || prev.id !== orderId) return prev;
        return { ...prev, itemCount: loaded.filter((i) => !i.voidedAt).length };
      });
    },
    [],
  );

  // -------------------------------------------------------------------------
  // refreshHeldOrders — load all draft orders with held_at set
  // -------------------------------------------------------------------------
  const refreshHeldOrders = useCallback(async () => {
    const held = await database
      .get<Order>('orders')
      .query(
        Q.where('status', 'draft'),
        Q.where('held_at', Q.notEq(null)),
        Q.sortBy('held_at', Q.desc),
      )
      .fetch();

    const summaries: HeldOrderSummary[] = await Promise.all(
      held.map(async (order) => {
        const orderItems = await database
          .get<OrderItem>('order_items')
          .query(Q.where('order_id', order.id))
          .fetch();

        let customerName: string | null = null;
        if (order.customerId) {
          try {
            const customer = await database.get<Customer>('customers').find(order.customerId);
            const parts = [customer.firstName, customer.lastName].filter(Boolean);
            customerName = parts.join(' ') || null;
          } catch {
            // Customer not found
          }
        }

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          orderType: (order.orderType as OrderType) || 'takeaway',
          tableNumber: order.tableNumber || null,
          customerName,
          itemCount: orderItems.length,
          total: order.total,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          heldAt: (order as any)._raw.held_at as number,
        };
      }),
    );

    setHeldOrders(summaries);
  }, []);

  // -------------------------------------------------------------------------
  // doCreateOrder
  // -------------------------------------------------------------------------
  const doCreateOrder = useCallback(async () => {
    const orderNumber = await getNextOrderNumber();
    const staffId = (await SecureStore.getItemAsync(STAFF_ID_KEY)) ?? '';

    const now = Date.now();
    await database.write(async () => {
      const created = await database.get<Order>('orders').create((o) => {
        setRaw(o, 'server_id', generateUUID());
        setRaw(o, 'order_number', orderNumber);
        setRaw(o, 'order_type', 'takeaway');
        setRaw(o, 'status', 'draft');
        setRaw(o, 'table_number', '');
        setRaw(o, 'customer_id', '');
        setRaw(o, 'staff_id', staffId);
        setRaw(o, 'terminal_id', 'terminal-1');
        setRaw(o, 'subtotal', 0);
        setRaw(o, 'gst', 0);
        setRaw(o, 'total', 0);
        setRaw(o, 'discount_amount', 0);
        setRaw(o, 'discount_type', '');
        setRaw(o, 'discount_value', 0);
        setRaw(o, 'discount_reason', '');
        setRaw(o, 'notes', '');
        setRaw(o, 'created_at', now);
        setRaw(o, 'updated_at', now);
      });

      orderRecordIdRef.current = created.id;

      setCurrentOrder({
        id: created.id,
        orderNumber,
        orderType: 'takeaway',
        tableNumber: null,
        itemCount: 0,
        customerId: null,
        customerName: null,
        customerEmail: null,
        status: 'draft',
      });

      setItems([]);
      setCartTotals(ZERO_TOTALS);
      setOrderDiscount(null);
      setIsManagingSubmittedOrder(false);
    });
  }, []);

  // -------------------------------------------------------------------------
  // createNewOrder
  // -------------------------------------------------------------------------
  const createNewOrder = useCallback(async () => {
    if (currentOrder && currentOrder.itemCount > 0) {
      return new Promise<void>((resolve) => {
        Alert.alert('Start new order?', 'Current order will be held.', [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
          {
            text: 'New Order',
            onPress: async () => {
              if (orderRecordIdRef.current) {
                await database.write(async () => {
                  const record = await database
                    .get<Order>('orders')
                    .find(orderRecordIdRef.current!);
                  await record.update((o) => {
                    setRaw(o, 'status', 'open');
                  });
                });
              }
              await doCreateOrder();
              resolve();
            },
          },
        ]);
      });
    }

    await doCreateOrder();
  }, [currentOrder, doCreateOrder]);

  // -------------------------------------------------------------------------
  // setOrderType
  // -------------------------------------------------------------------------
  const setOrderType = useCallback((type: OrderType) => {
    setCurrentOrder((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, orderType: type };
      if (type === 'takeaway') {
        updated.tableNumber = null;
      }
      return updated;
    });

    if (orderRecordIdRef.current) {
      database
        .write(async () => {
          const record = await database.get<Order>('orders').find(orderRecordIdRef.current!);
          await record.update((o) => {
            setRaw(o, 'order_type', type);
            if (type === 'takeaway') {
              setRaw(o, 'table_number', '');
            }
          });
        })
        .catch(() => {});
    }
  }, []);

  // -------------------------------------------------------------------------
  // setTableNumber
  // -------------------------------------------------------------------------
  const setTableNumber = useCallback((num: string | null) => {
    setCurrentOrder((prev) => {
      if (!prev) return prev;
      return { ...prev, tableNumber: num };
    });

    if (orderRecordIdRef.current) {
      database
        .write(async () => {
          const record = await database.get<Order>('orders').find(orderRecordIdRef.current!);
          await record.update((o) => {
            setRaw(o, 'table_number', num ?? '');
          });
        })
        .catch(() => {});
    }
  }, []);

  // -------------------------------------------------------------------------
  // addItem
  // -------------------------------------------------------------------------
  const addItem = useCallback(
    async (params: AddItemParams) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      const now = Date.now();
      await database.write(async () => {
        await database.get<OrderItem>('order_items').create((oi) => {
          setRaw(oi, 'server_id', generateUUID());
          setRaw(oi, 'order_id', orderId);
          setRaw(oi, 'product_id', params.productId);
          setRaw(oi, 'quantity', params.quantity);
          setRaw(oi, 'unit_price', params.basePrice);
          setRaw(oi, 'modifiers_json', JSON.stringify(params.selectedModifiers));
          setRaw(oi, 'line_total', params.lineTotal);
          setRaw(oi, 'discount_amount', 0);
          setRaw(oi, 'discount_type', '');
          setRaw(oi, 'discount_value', 0);
          setRaw(oi, 'discount_reason', '');
          setRaw(oi, 'notes', '');
          setRaw(oi, 'voided_at', 0);
          setRaw(oi, 'void_reason', '');
          setRaw(oi, 'override_price', 0);
          setRaw(oi, 'override_reason', '');
          setRaw(oi, 'is_gst_free', 0);
          setRaw(oi, 'created_at', now);
          setRaw(oi, 'updated_at', now);
        });
      });

      await refreshItems(orderId, orderDiscount);
    },
    [refreshItems, orderDiscount],
  );

  // -------------------------------------------------------------------------
  // updateItemQuantity
  // -------------------------------------------------------------------------
  const updateItemQuantity = useCallback(
    async (itemId: string, newQuantity: number) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      if (newQuantity <= 0) {
        await database.write(async () => {
          const record = await database.get<OrderItem>('order_items').find(itemId);
          await record.destroyPermanently();
        });
      } else {
        // Find the item to recalculate line total
        const item = items.find((i) => i.id === itemId);
        if (!item) return;

        const newLineTotal = calculateLineTotal(
          item.unitPrice,
          item.modifiers.map((m) => m.priceAdjustment),
          newQuantity,
        );

        await database.write(async () => {
          const record = await database.get<OrderItem>('order_items').find(itemId);
          await record.update((oi) => {
            setRaw(oi, 'quantity', newQuantity);
            setRaw(oi, 'line_total', newLineTotal);
          });
        });
      }

      await refreshItems(orderId, orderDiscount);
    },
    [items, refreshItems, orderDiscount],
  );

  // -------------------------------------------------------------------------
  // removeItem
  // -------------------------------------------------------------------------
  const removeItem = useCallback(
    async (itemId: string) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      await database.write(async () => {
        const record = await database.get<OrderItem>('order_items').find(itemId);
        await record.destroyPermanently();
      });

      await refreshItems(orderId, orderDiscount);
    },
    [refreshItems, orderDiscount],
  );

  // -------------------------------------------------------------------------
  // updateItemModifiers
  // -------------------------------------------------------------------------
  const updateItemModifiers = useCallback(
    async (
      itemId: string,
      modifiers: { id: string; name: string; priceAdjustment: number }[],
      newLineTotal: number,
    ) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      await database.write(async () => {
        const record = await database.get<OrderItem>('order_items').find(itemId);
        await record.update((oi) => {
          setRaw(oi, 'modifiers_json', JSON.stringify(modifiers));
          setRaw(oi, 'line_total', newLineTotal);
        });
      });

      await refreshItems(orderId, orderDiscount);
    },
    [refreshItems, orderDiscount],
  );

  // -------------------------------------------------------------------------
  // addItemNote
  // -------------------------------------------------------------------------
  const addItemNote = useCallback(
    async (itemId: string, note: string) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      await database.write(async () => {
        const record = await database.get<OrderItem>('order_items').find(itemId);
        await record.update((oi) => {
          setRaw(oi, 'notes', note);
        });
      });

      await refreshItems(orderId, orderDiscount);
    },
    [refreshItems, orderDiscount],
  );

  // -------------------------------------------------------------------------
  // setCustomer
  // -------------------------------------------------------------------------
  const setCustomer = useCallback(async (customerId: string | null) => {
    const orderId = orderRecordIdRef.current;
    if (!orderId) return;

    let customerName: string | null = null;
    let customerEmail: string | null = null;
    if (customerId) {
      try {
        const customer = await database.get<Customer>('customers').find(customerId);
        const parts = [customer.firstName, customer.lastName].filter(Boolean);
        customerName = parts.join(' ') || null;
        customerEmail = customer.email || null;
      } catch {
        // Customer not found
      }
    }

    await database.write(async () => {
      const record = await database.get<Order>('orders').find(orderId);
      await record.update((o) => {
        setRaw(o, 'customer_id', customerId ?? '');
      });
    });

    setCurrentOrder((prev) => {
      if (!prev) return prev;
      return { ...prev, customerId, customerName, customerEmail };
    });
  }, []);

  // -------------------------------------------------------------------------
  // applyOrderDiscount
  // -------------------------------------------------------------------------
  const applyOrderDiscount = useCallback(
    async (type: DiscountType, value: number, reason: string) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      const newDiscount: OrderDiscountData = { type, value, reason };
      setOrderDiscount(newDiscount);

      await database.write(async () => {
        const record = await database.get<Order>('orders').find(orderId);
        await record.update((o) => {
          setRaw(o, 'discount_type', type);
          setRaw(o, 'discount_value', value);
          setRaw(o, 'discount_reason', reason);
        });
      });

      await refreshItems(orderId, newDiscount);
    },
    [refreshItems],
  );

  // -------------------------------------------------------------------------
  // removeOrderDiscount
  // -------------------------------------------------------------------------
  const removeOrderDiscount = useCallback(async () => {
    const orderId = orderRecordIdRef.current;
    if (!orderId) return;

    setOrderDiscount(null);

    await database.write(async () => {
      const record = await database.get<Order>('orders').find(orderId);
      await record.update((o) => {
        setRaw(o, 'discount_type', '');
        setRaw(o, 'discount_value', 0);
        setRaw(o, 'discount_reason', '');
      });
    });

    await refreshItems(orderId, null);
  }, [refreshItems]);

  // -------------------------------------------------------------------------
  // applyItemDiscount
  // -------------------------------------------------------------------------
  const applyItemDiscount = useCallback(
    async (itemId: string, type: DiscountType, value: number, reason: string) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const discountAmount = calculateItemDiscount(item.lineTotal, { type, value });

      await database.write(async () => {
        const record = await database.get<OrderItem>('order_items').find(itemId);
        await record.update((oi) => {
          setRaw(oi, 'discount_amount', discountAmount);
          setRaw(oi, 'discount_type', type);
          setRaw(oi, 'discount_value', value);
          setRaw(oi, 'discount_reason', reason);
        });
      });

      await refreshItems(orderId, orderDiscount);
    },
    [items, refreshItems, orderDiscount],
  );

  // -------------------------------------------------------------------------
  // removeItemDiscount
  // -------------------------------------------------------------------------
  const removeItemDiscount = useCallback(
    async (itemId: string) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      await database.write(async () => {
        const record = await database.get<OrderItem>('order_items').find(itemId);
        await record.update((oi) => {
          setRaw(oi, 'discount_amount', 0);
          setRaw(oi, 'discount_type', '');
          setRaw(oi, 'discount_value', 0);
          setRaw(oi, 'discount_reason', '');
        });
      });

      await refreshItems(orderId, orderDiscount);
    },
    [refreshItems, orderDiscount],
  );

  // -------------------------------------------------------------------------
  // submitOrder
  // -------------------------------------------------------------------------
  const submitOrder = useCallback(async () => {
    const orderId = orderRecordIdRef.current;
    if (!orderId) return;

    if (items.length === 0) {
      Alert.alert('Cannot submit', 'Add at least one item before submitting.');
      return;
    }

    await transitionOrder(orderId, 'submitted');

    // Build and print kitchen docket
    if (currentOrder) {
      const docketOrder = {
        orderNumber: currentOrder.orderNumber,
        orderType: currentOrder.orderType,
        ...(currentOrder.tableNumber && { tableNumber: currentOrder.tableNumber }),
        createdAt: Date.now(),
      };
      const docketItems = items.map((item) => ({
        productName: item.productName,
        modifiers: item.modifiers.map((m) => m.name),
        quantity: item.quantity,
        notes: item.notes,
        isVoided: item.voidedAt > 0,
      }));
      const docketData = buildKitchenDocket(docketOrder, docketItems);
      getPrinterService().printDocket(docketData);
      setLastDocket(docketData);
    }

    eventBus.emit('pos.order.submitted', {
      orderId,
      organizationId: 'org-1',
      total: cartTotals.total,
      itemCount: items.length,
      timestamp: new Date(),
    });

    setCurrentOrder((prev) => {
      if (!prev) return prev;
      return { ...prev, status: 'submitted' };
    });

    // Auto-start a new order after brief delay
    setTimeout(() => {
      doCreateOrder();
    }, 300);
  }, [items, cartTotals, currentOrder, doCreateOrder]);

  // -------------------------------------------------------------------------
  // cancelOrder
  // -------------------------------------------------------------------------
  const cancelOrder = useCallback(
    async (reason: string) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      await transitionOrder(orderId, 'cancelled');

      // Store cancellation reason in notes
      await database.write(async () => {
        const record = await database.get<Order>('orders').find(orderId);
        await record.update((o) => {
          setRaw(o, 'notes', `Cancelled: ${reason}`);
        });
      });

      // Start fresh order
      await doCreateOrder();
    },
    [doCreateOrder],
  );

  // -------------------------------------------------------------------------
  // holdOrder
  // -------------------------------------------------------------------------
  const holdOrder = useCallback(async () => {
    const orderId = orderRecordIdRef.current;
    if (!orderId) return;

    if (items.length === 0) {
      Alert.alert('Cannot hold', 'Add at least one item before holding.');
      return;
    }

    // Check held order limit
    if (heldOrders.length >= MAX_HELD_ORDERS) {
      Alert.alert(
        'Limit reached',
        `You can hold a maximum of ${MAX_HELD_ORDERS} orders. Please recall or cancel a held order first.`,
      );
      return;
    }

    // Set held_at timestamp on the order
    await database.write(async () => {
      const record = await database.get<Order>('orders').find(orderId);
      await record.update((o) => {
        setRaw(o, 'held_at', Date.now());
      });
    });

    // Show warning if approaching limit
    if (heldOrders.length + 1 >= HELD_ORDER_WARNING_THRESHOLD) {
      Alert.alert(
        'Held orders',
        `You have ${heldOrders.length + 1} held orders (max ${MAX_HELD_ORDERS}).`,
      );
    }

    await doCreateOrder();
    await refreshHeldOrders();
  }, [doCreateOrder, items.length, heldOrders.length, refreshHeldOrders]);

  // -------------------------------------------------------------------------
  // recallOrder
  // -------------------------------------------------------------------------
  const recallOrder = useCallback(
    async (heldOrderId: string) => {
      const currentId = orderRecordIdRef.current;

      // If current order has items, hold it first
      if (currentId && items.length > 0) {
        await database.write(async () => {
          const record = await database.get<Order>('orders').find(currentId);
          await record.update((o) => {
            setRaw(o, 'held_at', Date.now());
          });
        });
      } else if (currentId && items.length === 0) {
        // Delete the empty draft order
        try {
          await database.write(async () => {
            const record = await database.get<Order>('orders').find(currentId);
            await record.destroyPermanently();
          });
        } catch {
          // Already deleted
        }
      }

      // Load the held order
      const heldRecord = await database.get<Order>('orders').find(heldOrderId);

      // Clear held_at
      await database.write(async () => {
        const fresh = await database.get<Order>('orders').find(heldOrderId);
        await fresh.update((o) => {
          setRaw(o, 'held_at', 0);
        });
      });

      orderRecordIdRef.current = heldOrderId;

      // Resolve customer name and email
      let customerName: string | null = null;
      let customerEmail: string | null = null;
      if (heldRecord.customerId) {
        try {
          const customer = await database.get<Customer>('customers').find(heldRecord.customerId);
          const parts = [customer.firstName, customer.lastName].filter(Boolean);
          customerName = parts.join(' ') || null;
          customerEmail = customer.email || null;
        } catch {
          // Customer not found
        }
      }

      // Restore order discount from DB fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (heldRecord as any)._raw;
      const restoredDiscount: OrderDiscountData | null =
        raw.discount_type && raw.discount_value > 0
          ? {
              type: raw.discount_type as DiscountType,
              value: raw.discount_value as number,
              reason: (raw.discount_reason as string) || '',
            }
          : null;
      setOrderDiscount(restoredDiscount);

      setCurrentOrder({
        id: heldOrderId,
        orderNumber: heldRecord.orderNumber,
        orderType: (heldRecord.orderType as OrderType) || 'takeaway',
        tableNumber: heldRecord.tableNumber || null,
        itemCount: 0, // will be updated by refreshItems
        customerId: heldRecord.customerId || null,
        customerName,
        customerEmail,
        status: 'draft',
      });

      await refreshItems(heldOrderId, restoredDiscount);
      await refreshHeldOrders();
    },
    [items.length, refreshItems, refreshHeldOrders],
  );

  // -------------------------------------------------------------------------
  // loadSubmittedOrder
  // -------------------------------------------------------------------------
  const loadSubmittedOrder = useCallback(
    async (orderId: string) => {
      const orderRecord = await database.get<Order>('orders').find(orderId);
      const status = orderRecord.status as OrderStatusDB;

      if (status !== 'submitted' && status !== 'in_progress') {
        Alert.alert('Cannot manage', 'Only submitted or in-progress orders can be managed.');
        return;
      }

      const currentId = orderRecordIdRef.current;

      // If current draft is empty, delete it; if has items, hold it
      if (currentId && currentId !== orderId) {
        if (items.length > 0) {
          await database.write(async () => {
            const record = await database.get<Order>('orders').find(currentId);
            await record.update((o) => {
              setRaw(o, 'held_at', Date.now());
            });
          });
        } else {
          try {
            await database.write(async () => {
              const record = await database.get<Order>('orders').find(currentId);
              await record.destroyPermanently();
            });
          } catch {
            // Already deleted
          }
        }
      }

      orderRecordIdRef.current = orderId;

      // Resolve customer name and email
      let customerName: string | null = null;
      let customerEmail: string | null = null;
      if (orderRecord.customerId) {
        try {
          const customer = await database.get<Customer>('customers').find(orderRecord.customerId);
          const parts = [customer.firstName, customer.lastName].filter(Boolean);
          customerName = parts.join(' ') || null;
          customerEmail = customer.email || null;
        } catch {
          // Customer not found
        }
      }

      // Restore order discount from DB fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (orderRecord as any)._raw;
      const restoredDiscount: OrderDiscountData | null =
        raw.discount_type && raw.discount_value > 0
          ? {
              type: raw.discount_type as DiscountType,
              value: raw.discount_value as number,
              reason: (raw.discount_reason as string) || '',
            }
          : null;
      setOrderDiscount(restoredDiscount);

      setIsManagingSubmittedOrder(true);

      setCurrentOrder({
        id: orderId,
        orderNumber: orderRecord.orderNumber,
        orderType: (orderRecord.orderType as OrderType) || 'takeaway',
        tableNumber: orderRecord.tableNumber || null,
        itemCount: 0,
        customerId: orderRecord.customerId || null,
        customerName,
        customerEmail,
        status,
      });

      await refreshItems(orderId, restoredDiscount);

      // Snapshot current items for modification docket diffing
      const snapshotItems = await database
        .get<OrderItem>('order_items')
        .query(Q.where('order_id', orderId))
        .fetch();
      submittedItemsSnapshotRef.current = snapshotItems.map((oi) => ({
        id: oi.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        voidedAt: (oi as any)._raw.voided_at ?? 0,
      }));

      await refreshHeldOrders();
    },
    [items.length, refreshItems, refreshHeldOrders],
  );

  // -------------------------------------------------------------------------
  // addItemToSubmittedOrder
  // -------------------------------------------------------------------------
  const addItemToSubmittedOrder = useCallback(
    async (params: AddItemParams) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      const now = Date.now();
      await database.write(async () => {
        await database.get<OrderItem>('order_items').create((oi) => {
          setRaw(oi, 'server_id', generateUUID());
          setRaw(oi, 'order_id', orderId);
          setRaw(oi, 'product_id', params.productId);
          setRaw(oi, 'quantity', params.quantity);
          setRaw(oi, 'unit_price', params.basePrice);
          setRaw(oi, 'modifiers_json', JSON.stringify(params.selectedModifiers));
          setRaw(oi, 'line_total', params.lineTotal);
          setRaw(oi, 'discount_amount', 0);
          setRaw(oi, 'discount_type', '');
          setRaw(oi, 'discount_value', 0);
          setRaw(oi, 'discount_reason', '');
          setRaw(oi, 'notes', '');
          setRaw(oi, 'voided_at', 0);
          setRaw(oi, 'void_reason', '');
          setRaw(oi, 'override_price', 0);
          setRaw(oi, 'override_reason', '');
          setRaw(oi, 'is_gst_free', 0);
          setRaw(oi, 'created_at', now);
          setRaw(oi, 'updated_at', now);
        });
      });

      await refreshItems(orderId, orderDiscount);
    },
    [refreshItems, orderDiscount],
  );

  // -------------------------------------------------------------------------
  // voidItem
  // -------------------------------------------------------------------------
  const voidItem = useCallback(
    async (itemId: string, reason: string, managerApprover?: string) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      // Guard double-void
      if (item.voidedAt && item.voidedAt > 0) return;

      const now = Date.now();
      const currentStaffId = (await SecureStore.getItemAsync(STAFF_ID_KEY)) ?? '';

      await database.write(async () => {
        // Update the order item
        const record = await database.get<OrderItem>('order_items').find(itemId);
        await record.update((oi) => {
          setRaw(oi, 'voided_at', now);
          setRaw(oi, 'void_reason', reason);
        });

        // Create audit log
        await database.get<AuditLog>('audit_logs').create((log) => {
          setRaw(log, 'server_id', generateUUID());
          setRaw(log, 'action', 'void_item');
          setRaw(log, 'entity_type', 'order_item');
          setRaw(log, 'entity_id', itemId);
          setRaw(log, 'staff_id', currentStaffId);
          setRaw(log, 'manager_approver', managerApprover ?? '');
          setRaw(
            log,
            'changes_json',
            JSON.stringify({
              productName: item.productName,
              quantity: item.quantity,
              lineTotal: item.lineTotal,
              reason,
            }),
          );
          setRaw(log, 'device_id', 'terminal-1');
          setRaw(log, 'created_at', now);
        });
      });

      // Emit event
      eventBus.emit('pos.item.voided', {
        orderId,
        orderItemId: itemId,
        organizationId: 'org-1',
        productName: item.productName,
        originalAmount: item.lineTotal,
        voidReason: reason,
        staffId: 'pos-terminal',
        managerApproverId: managerApprover,
        timestamp: new Date(),
      });

      await refreshItems(orderId, orderDiscount);
    },
    [items, refreshItems, orderDiscount],
  );

  // -------------------------------------------------------------------------
  // overrideItemPrice
  // -------------------------------------------------------------------------
  const overrideItemPrice = useCallback(
    async (itemId: string, newPrice: number, reason: string, managerApprover: string) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      // Guard: cannot override a voided item
      if (item.voidedAt && item.voidedAt > 0) return;

      const modifierAdjustments = item.modifiers.map((m) => m.priceAdjustment);
      const newLineTotal = calculateLineTotal(newPrice, modifierAdjustments, item.quantity);

      const now = Date.now();
      const currentStaffId = (await SecureStore.getItemAsync(STAFF_ID_KEY)) ?? '';

      await database.write(async () => {
        const record = await database.get<OrderItem>('order_items').find(itemId);
        await record.update((oi) => {
          setRaw(oi, 'override_price', newPrice);
          setRaw(oi, 'override_reason', reason);
          setRaw(oi, 'line_total', newLineTotal);
        });

        // Create audit log
        await database.get<AuditLog>('audit_logs').create((log) => {
          setRaw(log, 'server_id', generateUUID());
          setRaw(log, 'action', 'price_override');
          setRaw(log, 'entity_type', 'order_item');
          setRaw(log, 'entity_id', itemId);
          setRaw(log, 'staff_id', currentStaffId);
          setRaw(log, 'manager_approver', managerApprover);
          setRaw(
            log,
            'changes_json',
            JSON.stringify({
              productName: item.productName,
              originalPrice: item.unitPrice,
              overridePrice: newPrice,
              reason,
            }),
          );
          setRaw(log, 'device_id', 'terminal-1');
          setRaw(log, 'created_at', now);
        });
      });

      // Emit event
      eventBus.emit('pos.item.price_overridden', {
        orderId,
        orderItemId: itemId,
        organizationId: 'org-1',
        productName: item.productName,
        originalPrice: item.unitPrice,
        overridePrice: newPrice,
        overrideReason: reason,
        staffId: 'pos-terminal',
        managerApproverId: managerApprover,
        timestamp: new Date(),
      });

      await refreshItems(orderId, orderDiscount);
    },
    [items, refreshItems, orderDiscount],
  );

  // -------------------------------------------------------------------------
  // removeItemPriceOverride
  // -------------------------------------------------------------------------
  const removeItemPriceOverride = useCallback(
    async (itemId: string) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const modifierAdjustments = item.modifiers.map((m) => m.priceAdjustment);
      const originalLineTotal = calculateLineTotal(
        item.unitPrice,
        modifierAdjustments,
        item.quantity,
      );

      await database.write(async () => {
        const record = await database.get<OrderItem>('order_items').find(itemId);
        await record.update((oi) => {
          setRaw(oi, 'override_price', 0);
          setRaw(oi, 'override_reason', '');
          setRaw(oi, 'line_total', originalLineTotal);
        });
      });

      await refreshItems(orderId, orderDiscount);
    },
    [items, refreshItems, orderDiscount],
  );

  // -------------------------------------------------------------------------
  // returnToNewOrder
  // -------------------------------------------------------------------------
  const returnToNewOrder = useCallback(async () => {
    // Build modification docket if managing a submitted order
    if (isManagingSubmittedOrder && currentOrder) {
      const snapshot = submittedItemsSnapshotRef.current;
      const snapshotIds = new Set(snapshot.map((s) => s.id));

      const newItems = items
        .filter((item) => !snapshotIds.has(item.id) && item.voidedAt === 0)
        .map((item) => ({
          productName: item.productName,
          modifiers: item.modifiers.map((m) => m.name),
          quantity: item.quantity,
          notes: item.notes,
          isVoided: false,
        }));

      const newlyVoided = items
        .filter((item) => {
          if (item.voidedAt === 0) return false;
          const snap = snapshot.find((s) => s.id === item.id);
          return snap && snap.voidedAt === 0;
        })
        .map((item) => ({
          productName: item.productName,
          modifiers: item.modifiers.map((m) => m.name),
          quantity: item.quantity,
          notes: item.notes,
          isVoided: true,
        }));

      const docketOrder = {
        orderNumber: currentOrder.orderNumber,
        orderType: currentOrder.orderType,
        ...(currentOrder.tableNumber && { tableNumber: currentOrder.tableNumber }),
        createdAt: Date.now(),
      };

      const modDocket = buildModificationDocket(docketOrder, newItems, newlyVoided);
      if (modDocket) {
        getPrinterService().printDocket(modDocket);
        setLastDocket(modDocket);
      }
    }

    submittedItemsSnapshotRef.current = [];
    setIsManagingSubmittedOrder(false);
    await doCreateOrder();
    await refreshHeldOrders();
  }, [doCreateOrder, refreshHeldOrders, isManagingSubmittedOrder, currentOrder, items]);

  // -------------------------------------------------------------------------
  // recordPartialPayment (split payment — records one portion without completing order)
  // -------------------------------------------------------------------------
  const recordPartialPayment = useCallback(
    async (params: CompletePaymentParams) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      if (items.length === 0) {
        Alert.alert('Cannot pay', 'Add at least one item before paying.');
        return;
      }

      // Auto-submit draft orders on first partial payment
      const status = currentOrder?.status;
      if (status === 'draft') {
        await transitionOrder(orderId, 'submitted');
      }

      // Create Payment record
      let paymentId = '';
      const now = Date.now();
      await database.write(async () => {
        const payment = await database.get<Payment>('payments').create((p) => {
          setRaw(p, 'server_id', generateUUID());
          setRaw(p, 'order_id', orderId);
          setRaw(p, 'method', params.method);
          setRaw(p, 'amount', params.amount);
          setRaw(p, 'tip_amount', params.tipAmount);

          if (params.method === 'cash') {
            setRaw(p, 'tendered_amount', params.tenderedAmount);
            setRaw(p, 'change_given', params.changeGiven);
            setRaw(p, 'rounding_amount', params.roundingAmount);
          } else {
            setRaw(p, 'reference', params.approvalCode);
            setRaw(p, 'card_type', params.cardType);
            setRaw(p, 'last_four', params.lastFour);
          }

          setRaw(p, 'status', 'completed');
          setRaw(p, 'created_at', now);
          setRaw(p, 'updated_at', now);
        });
        paymentId = payment.id;
      });

      // Priority sync payment (but do NOT complete the order)
      onPaymentCompleted(orderId, paymentId);
    },
    [items, currentOrder],
  );

  // -------------------------------------------------------------------------
  // completePayment
  // -------------------------------------------------------------------------
  const completePayment = useCallback(
    async (params: CompletePaymentParams): Promise<ReceiptData | undefined> => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return undefined;

      if (items.length === 0) {
        Alert.alert('Cannot pay', 'Add at least one item before paying.');
        return undefined;
      }

      // Auto-submit draft orders before paying
      const status = currentOrder?.status;
      if (status === 'draft') {
        await transitionOrder(orderId, 'submitted');
      }

      // Create Payment record
      let paymentId = '';
      const now = Date.now();
      await database.write(async () => {
        const payment = await database.get<Payment>('payments').create((p) => {
          setRaw(p, 'server_id', generateUUID());
          setRaw(p, 'order_id', orderId);
          setRaw(p, 'method', params.method);
          setRaw(p, 'amount', params.amount);
          setRaw(p, 'tip_amount', params.tipAmount);

          if (params.method === 'cash') {
            setRaw(p, 'tendered_amount', params.tenderedAmount);
            setRaw(p, 'change_given', params.changeGiven);
            setRaw(p, 'rounding_amount', params.roundingAmount);
          } else {
            setRaw(p, 'reference', params.approvalCode);
            setRaw(p, 'card_type', params.cardType);
            setRaw(p, 'last_four', params.lastFour);
          }

          setRaw(p, 'status', 'completed');
          setRaw(p, 'created_at', now);
          setRaw(p, 'updated_at', now);
        });
        paymentId = payment.id;
      });

      // Build receipt data
      const receiptItems: ReceiptItemInput[] = items.map((i) => ({
        productName: i.productName,
        modifiers: i.modifiers.map((m) => m.name),
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
        discountAmount: i.discountAmount,
        isVoided: !!i.voidedAt,
        isGstFree: i.isGstFree,
      }));

      const receiptPayment: ReceiptPaymentInput = {
        method: params.method,
        amount: params.amount,
        tipAmount: params.tipAmount,
        ...(params.method === 'cash' && {
          tenderedAmount: params.tenderedAmount,
          changeGiven: params.changeGiven,
          roundingAmount: params.roundingAmount,
        }),
        ...(params.method === 'card' && {
          cardType: params.cardType,
          lastFour: params.lastFour,
          approvalCode: params.approvalCode,
        }),
      };

      const receiptData = buildReceipt(
        {
          businessName: 'Float POS',
          abn: '12 345 678 901',
          address: '123 Main Street',
          phone: '03 9123 4567',
        },
        {
          orderNumber: currentOrder?.orderNumber ?? '',
          orderType: (currentOrder?.orderType as 'takeaway' | 'dine_in') ?? 'takeaway',
          tableNumber: currentOrder?.tableNumber ?? undefined,
          subtotal: cartTotals.subtotal,
          gstAmount: cartTotals.gstAmount,
          discountTotal: cartTotals.totalDiscount,
          total: cartTotals.total,
          createdAt: now,
          customerName: currentOrder?.customerName ?? undefined,
        },
        receiptItems,
        [receiptPayment],
        'Staff',
      );

      // Store receipt JSON on order record
      await database.write(async () => {
        const orderRecord = await database.get<Order>('orders').find(orderId);
        await orderRecord.update((o) => {
          setRaw(o, 'receipt_json', JSON.stringify(receiptData));
        });
      });

      // Transition order to completed
      await transitionOrder(orderId, 'completed');

      eventBus.emit('pos.order.completed', {
        orderId,
        organizationId: 'org-1',
        total: cartTotals.total,
        tipAmount: params.tipAmount,
        items: items
          .filter((i) => !i.voidedAt)
          .map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        timestamp: new Date(),
      });

      // Priority sync payment
      onPaymentCompleted(orderId, paymentId);

      // Auto-start a new order after brief delay
      setTimeout(() => {
        doCreateOrder();
      }, 300);

      return receiptData;
    },
    [items, currentOrder, cartTotals, doCreateOrder],
  );

  // -------------------------------------------------------------------------
  // refundOrder
  // -------------------------------------------------------------------------
  const refundOrder = useCallback(async (params: RefundParams) => {
    const {
      orderId,
      refundAmount,
      reason,
      refundMethod,
      managerApprover,
      isFullRefund,
      refundedItemIds,
      approvalCode,
      cardType,
      cardLastFour,
    } = params;

    // Build reference: for card refunds include approval code, otherwise just reason
    const reference =
      refundMethod === 'card' && approvalCode ? `${reason} | Approval: ${approvalCode}` : reason;

    // Create refund payment record (negative amount)
    let paymentId = '';
    const now = Date.now();
    await database.write(async () => {
      const payment = await database.get<Payment>('payments').create((p) => {
        setRaw(p, 'server_id', generateUUID());
        setRaw(p, 'order_id', orderId);
        setRaw(p, 'method', refundMethod);
        setRaw(p, 'amount', -refundAmount);
        setRaw(p, 'tip_amount', 0);
        setRaw(p, 'reference', reference);
        setRaw(p, 'status', 'refunded');
        setRaw(p, 'created_at', now);
        setRaw(p, 'updated_at', now);
      });
      paymentId = payment.id;

      // Audit log
      await database.get<AuditLog>('audit_logs').create((a) => {
        setRaw(a, 'server_id', generateUUID());
        setRaw(a, 'action', isFullRefund ? 'refund_full' : 'refund_partial');
        setRaw(a, 'entity_type', 'order');
        setRaw(a, 'entity_id', orderId);
        setRaw(a, 'staff_id', '');
        setRaw(a, 'manager_approver', managerApprover);
        setRaw(
          a,
          'changes_json',
          JSON.stringify({
            refundAmount,
            reason,
            refundMethod,
            isFullRefund,
            refundedItemIds: refundedItemIds ?? [],
            paymentId,
            ...(approvalCode && { approvalCode }),
            ...(cardType && { cardType }),
            ...(cardLastFour && { cardLastFour }),
          }),
        );
        setRaw(a, 'created_at', now);
      });
    });

    // Transition order to refunded (only for full refunds)
    if (isFullRefund) {
      await transitionOrder(orderId, 'refunded');
    }

    // Emit event
    eventBus.emit('pos.order.refunded', {
      orderId,
      organizationId: 'org-1',
      refundAmount,
      reason,
      timestamp: new Date(),
    });

    // Priority sync
    onPaymentCompleted(orderId, paymentId);
  }, []);

  // -------------------------------------------------------------------------
  // Provider value
  // -------------------------------------------------------------------------
  const value: OrderStoreValue = {
    currentOrder,
    createNewOrder,
    setOrderType,
    setTableNumber,
    items,
    cartTotals,
    addItem,
    updateItemQuantity,
    removeItem,
    updateItemModifiers,
    addItemNote,
    setCustomer,
    submitOrder,
    cancelOrder,
    holdOrder,
    recallOrder,
    heldOrders,
    refreshHeldOrders,
    orderDiscount,
    applyOrderDiscount,
    applyItemDiscount,
    removeOrderDiscount,
    removeItemDiscount,
    isManagingSubmittedOrder,
    loadSubmittedOrder,
    addItemToSubmittedOrder,
    voidItem,
    overrideItemPrice,
    removeItemPriceOverride,
    returnToNewOrder,
    completePayment,
    recordPartialPayment,
    refundOrder,
    lastDocket,
    clearLastDocket,
  };

  return React.createElement(OrderContext.Provider, { value }, children);
}

export function useOrder(): OrderStoreValue {
  return useContext(OrderContext);
}
