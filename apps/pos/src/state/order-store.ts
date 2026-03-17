import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Order, OrderItem, Product, Customer } from '../db/models';
import { calculateLineTotal, calculateCartTotals } from '@float0/shared';
import { eventBus } from '@float0/events';
import { transitionOrder } from './order-lifecycle';
import type { OrderStatusDB } from './order-lifecycle';

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
}

export interface CartTotalsData {
  subtotal: number;
  gstAmount: number;
  total: number;
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

const MAX_HELD_ORDERS = 20;
const HELD_ORDER_WARNING_THRESHOLD = 15;

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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStartOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function setRaw(record: Order | OrderItem, field: string, value: string | number) {
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

const ZERO_TOTALS: CartTotalsData = { subtotal: 0, gstAmount: 0, total: 0 };

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
});

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [currentOrder, setCurrentOrder] = useState<CurrentOrder | null>(null);
  const [items, setItems] = useState<CartItemData[]>([]);
  const [cartTotals, setCartTotals] = useState<CartTotalsData>(ZERO_TOTALS);
  const [heldOrders, setHeldOrders] = useState<HeldOrderSummary[]>([]);
  const orderRecordIdRef = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // refreshItems — reload items from DB & recalculate totals
  // -------------------------------------------------------------------------
  const refreshItems = useCallback(async (orderId: string) => {
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
        };
      }),
    );

    setItems(loaded);

    const totals = calculateCartTotals(
      loaded.map((item) => ({
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        isGstFree: item.isGstFree,
        modifiers: item.modifiers.map((m) => ({ priceAdjustment: m.priceAdjustment })),
      })),
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
        });
      });
    } catch {
      // Order may have been deleted
    }

    // Update item count in state
    setCurrentOrder((prev) => {
      if (!prev || prev.id !== orderId) return prev;
      return { ...prev, itemCount: loaded.length };
    });
  }, []);

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

    await database.write(async () => {
      const created = await database.get<Order>('orders').create((o) => {
        setRaw(o, 'server_id', '');
        setRaw(o, 'order_number', orderNumber);
        setRaw(o, 'order_type', 'takeaway');
        setRaw(o, 'status', 'draft');
        setRaw(o, 'table_number', '');
        setRaw(o, 'customer_id', '');
        setRaw(o, 'staff_id', 'pos-terminal');
        setRaw(o, 'terminal_id', 'terminal-1');
        setRaw(o, 'subtotal', 0);
        setRaw(o, 'gst', 0);
        setRaw(o, 'total', 0);
        setRaw(o, 'discount_amount', 0);
        setRaw(o, 'notes', '');
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
        status: 'draft',
      });

      setItems([]);
      setCartTotals(ZERO_TOTALS);
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
      database.write(async () => {
        const record = await database.get<Order>('orders').find(orderRecordIdRef.current!);
        await record.update((o) => {
          setRaw(o, 'order_type', type);
          if (type === 'takeaway') {
            setRaw(o, 'table_number', '');
          }
        });
      });
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
      database.write(async () => {
        const record = await database.get<Order>('orders').find(orderRecordIdRef.current!);
        await record.update((o) => {
          setRaw(o, 'table_number', num ?? '');
        });
      });
    }
  }, []);

  // -------------------------------------------------------------------------
  // addItem
  // -------------------------------------------------------------------------
  const addItem = useCallback(
    async (params: AddItemParams) => {
      const orderId = orderRecordIdRef.current;
      if (!orderId) return;

      await database.write(async () => {
        await database.get<OrderItem>('order_items').create((oi) => {
          setRaw(oi, 'server_id', '');
          setRaw(oi, 'order_id', orderId);
          setRaw(oi, 'product_id', params.productId);
          setRaw(oi, 'quantity', params.quantity);
          setRaw(oi, 'unit_price', params.basePrice);
          setRaw(oi, 'modifiers_json', JSON.stringify(params.selectedModifiers));
          setRaw(oi, 'line_total', params.lineTotal);
          setRaw(oi, 'notes', '');
        });
      });

      await refreshItems(orderId);
    },
    [refreshItems],
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

      await refreshItems(orderId);
    },
    [items, refreshItems],
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

      await refreshItems(orderId);
    },
    [refreshItems],
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

      await refreshItems(orderId);
    },
    [refreshItems],
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

      await refreshItems(orderId);
    },
    [refreshItems],
  );

  // -------------------------------------------------------------------------
  // setCustomer
  // -------------------------------------------------------------------------
  const setCustomer = useCallback(async (customerId: string | null) => {
    const orderId = orderRecordIdRef.current;
    if (!orderId) return;

    let customerName: string | null = null;
    if (customerId) {
      try {
        const customer = await database.get<Customer>('customers').find(customerId);
        const parts = [customer.firstName, customer.lastName].filter(Boolean);
        customerName = parts.join(' ') || null;
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
      return { ...prev, customerId, customerName };
    });
  }, []);

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
  }, [items, cartTotals, doCreateOrder]);

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

      // Resolve customer name
      let customerName: string | null = null;
      if (heldRecord.customerId) {
        try {
          const customer = await database.get<Customer>('customers').find(heldRecord.customerId);
          const parts = [customer.firstName, customer.lastName].filter(Boolean);
          customerName = parts.join(' ') || null;
        } catch {
          // Customer not found
        }
      }

      setCurrentOrder({
        id: heldOrderId,
        orderNumber: heldRecord.orderNumber,
        orderType: (heldRecord.orderType as OrderType) || 'takeaway',
        tableNumber: heldRecord.tableNumber || null,
        itemCount: 0, // will be updated by refreshItems
        customerId: heldRecord.customerId || null,
        customerName,
        status: 'draft',
      });

      await refreshItems(heldOrderId);
      await refreshHeldOrders();
    },
    [items.length, refreshItems, refreshHeldOrders],
  );

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
  };

  return React.createElement(OrderContext.Provider, { value }, children);
}

export function useOrder(): OrderStoreValue {
  return useContext(OrderContext);
}
