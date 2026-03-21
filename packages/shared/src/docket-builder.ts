// ---------------------------------------------------------------------------
// Kitchen Docket Data Model & Builder
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Input types (what callers provide)
// ---------------------------------------------------------------------------

export interface DocketItemInput {
  productName: string;
  modifiers: string[];
  quantity: number;
  notes: string;
  isVoided: boolean;
}

export interface DocketOrderInput {
  orderNumber: string;
  orderType: 'takeaway' | 'dine_in';
  tableNumber?: string;
  createdAt: number; // epoch ms
}

// ---------------------------------------------------------------------------
// Output types (docket data)
// ---------------------------------------------------------------------------

export interface DocketItem {
  name: string;
  modifiers: string[];
  quantity: number;
  notes: string;
  tag?: 'ADD' | 'VOID';
}

export interface KitchenDocketData {
  orderNumber: string;
  orderType: 'takeaway' | 'dine_in';
  tableNumber?: string;
  dateTime: string; // ISO-8601
  items: DocketItem[];
  isModification: boolean;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function buildKitchenDocket(
  order: DocketOrderInput,
  items: DocketItemInput[],
): KitchenDocketData {
  const docketItems: DocketItem[] = items
    .filter((item) => !item.isVoided)
    .map((item) => ({
      name: item.productName,
      modifiers: item.modifiers,
      quantity: item.quantity,
      notes: item.notes,
    }));

  return {
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    ...(order.tableNumber && { tableNumber: order.tableNumber }),
    dateTime: new Date(order.createdAt).toISOString(),
    items: docketItems,
    isModification: false,
  };
}

export function buildModificationDocket(
  order: DocketOrderInput,
  newItems: DocketItemInput[],
  voidedItems: DocketItemInput[],
): KitchenDocketData | null {
  if (newItems.length === 0 && voidedItems.length === 0) {
    return null;
  }

  const addItems: DocketItem[] = newItems.map((item) => ({
    name: item.productName,
    modifiers: item.modifiers,
    quantity: item.quantity,
    notes: item.notes,
    tag: 'ADD' as const,
  }));

  const voidItems: DocketItem[] = voidedItems.map((item) => ({
    name: item.productName,
    modifiers: item.modifiers,
    quantity: item.quantity,
    notes: item.notes,
    tag: 'VOID' as const,
  }));

  return {
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    ...(order.tableNumber && { tableNumber: order.tableNumber }),
    dateTime: new Date(order.createdAt).toISOString(),
    items: [...addItems, ...voidItems],
    isModification: true,
  };
}
