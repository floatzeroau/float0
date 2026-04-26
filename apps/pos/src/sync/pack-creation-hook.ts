import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { database } from '../db/database';
import type { Customer } from '../db/models';
import { API_URL, AUTH_TOKEN_KEY } from '../config';
import type { CartItemData } from '../state/order-store';

/**
 * After an order with pack purchase lines is completed, POST each pack to the engine.
 * Failures are logged and the barista is warned — the order itself is NOT rolled back.
 */
export async function createPacksForOrder(
  customerId: string,
  orderId: string,
  packItems: CartItemData[],
): Promise<void> {
  if (packItems.length === 0) return;

  let serverCustomerId: string;
  try {
    const cust = await database.get<Customer>('customers').find(customerId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    serverCustomerId = (cust._raw as any).server_id as string;
  } catch {
    console.warn('[PackCreation] Customer not found in local DB:', customerId);
    Alert.alert(
      'Pack Creation Warning',
      'Could not find customer record. Pack(s) were not created on the server — please create manually.',
    );
    return;
  }

  const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  const failures: string[] = [];

  for (const item of packItems) {
    try {
      const body: Record<string, unknown> = {
        productId: item.productId,
        productSnapshot: item.packProductSnapshot ?? {
          name: item.productName,
          basePrice: item.unitPrice,
        },
        totalQuantity: item.packTotalQuantity,
        pricePaid: item.packPrice,
        sourceOrderId: orderId,
      };
      if (item.packExpiryDate) {
        body.expiryDate = item.packExpiryDate;
      }

      const res = await fetch(`${API_URL}/customers/${serverCustomerId}/packs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.warn('[PackCreation] Failed to create pack for item', item.productName, msg);
      failures.push(`${item.productName}: ${msg}`);
    }
  }

  if (failures.length > 0) {
    Alert.alert(
      'Pack Creation Warning',
      `Some packs could not be created:\n\n${failures.join('\n')}\n\nPlease create them manually in the Hub.`,
    );
  }
}
