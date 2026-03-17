import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Order } from '../db/models';

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
  status: 'draft' | 'open';
}

interface OrderStoreValue {
  currentOrder: CurrentOrder | null;
  createNewOrder: () => Promise<void>;
  setOrderType: (type: OrderType) => void;
  setTableNumber: (num: string | null) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStartOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function setRaw(record: Order, field: string, value: string | number) {
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

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const OrderContext = createContext<OrderStoreValue>({
  currentOrder: null,
  createNewOrder: async () => {},
  setOrderType: () => {},
  setTableNumber: () => {},
});

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [currentOrder, setCurrentOrder] = useState<CurrentOrder | null>(null);
  const orderRecordIdRef = useRef<string | null>(null);

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
        status: 'draft',
      });
    });
  }, []);

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

  const value: OrderStoreValue = {
    currentOrder,
    createNewOrder,
    setOrderType,
    setTableNumber,
  };

  return React.createElement(OrderContext.Provider, { value }, children);
}

export function useOrder(): OrderStoreValue {
  return useContext(OrderContext);
}
