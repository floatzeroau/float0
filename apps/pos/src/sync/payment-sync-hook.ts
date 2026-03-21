import type { SyncManager } from './sync-manager';

let syncManagerRef: SyncManager | null = null;

export function setSyncManager(manager: SyncManager | null): void {
  syncManagerRef = manager;
}

export function onPaymentCompleted(orderId: string, paymentId: string): void {
  if (!syncManagerRef) {
    console.warn('SyncManager not initialized, cannot priority sync payment');
    return;
  }

  syncManagerRef.syncPriority([
    { table: 'orders', id: orderId },
    { table: 'payments', id: paymentId },
  ]);
}

export function onShiftClosed(shiftId: string): void {
  if (!syncManagerRef) {
    console.warn('SyncManager not initialized, cannot priority sync shift');
    return;
  }

  syncManagerRef.syncPriority([{ table: 'shifts', id: shiftId }]);
}
