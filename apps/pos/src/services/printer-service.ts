import { Alert } from 'react-native';
import type { ReceiptData } from '@float0/shared';

// ---------------------------------------------------------------------------
// Printer Service Interface
// ---------------------------------------------------------------------------

export interface PrinterStatus {
  connected: boolean;
  printerName?: string;
}

export interface IPrinterService {
  printReceipt(data: ReceiptData): Promise<void>;
  openDrawer(): Promise<void>;
  getStatus(): Promise<PrinterStatus>;
}

// ---------------------------------------------------------------------------
// Mock Printer — logs to console and shows toast
// ---------------------------------------------------------------------------

export class MockPrinterService implements IPrinterService {
  async printReceipt(data: ReceiptData): Promise<void> {
    console.log('[MockPrinter] Receipt printed:', data.orderNumber);
    Alert.alert('Receipt Printed', `Receipt for ${data.orderNumber} sent to printer.`);
  }

  async openDrawer(): Promise<void> {
    console.log('[MockPrinter] Cash drawer opened');
  }

  async getStatus(): Promise<PrinterStatus> {
    return {
      connected: true,
      printerName: 'MOCK-PRINTER',
    };
  }
}
