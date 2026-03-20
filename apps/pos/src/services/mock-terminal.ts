import type { ITerminalService, TerminalResult, TerminalStatus } from './terminal-service';

// ---------------------------------------------------------------------------
// Mock Terminal — simulates a card payment terminal
// ---------------------------------------------------------------------------

const MOCK_DELAY_MS = 2000;
const DECLINE_PROBABILITY = 0.1;

function generateApprovalCode(): string {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `MOCK-${rand}`;
}

export class MockTerminalService implements ITerminalService {
  private pendingReject: (() => void) | null = null;

  async sendPayment(amount: number): Promise<TerminalResult> {
    return new Promise((resolve, reject) => {
      this.pendingReject = () => reject(new Error('Transaction cancelled'));

      setTimeout(() => {
        this.pendingReject = null;

        // 10% chance of simulated decline
        if (Math.random() < DECLINE_PROBABILITY) {
          resolve({
            success: false,
            errorMessage: 'Card declined — insufficient funds',
          });
          return;
        }

        resolve({
          success: true,
          approvalCode: generateApprovalCode(),
          cardType: 'Visa',
          lastFour: '4242',
        });
      }, MOCK_DELAY_MS);
    });
  }

  async sendRefund(_amount: number, _originalRef: string): Promise<TerminalResult> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          approvalCode: generateApprovalCode(),
          cardType: 'Visa',
          lastFour: '4242',
        });
      }, MOCK_DELAY_MS);
    });
  }

  async cancelTransaction(): Promise<void> {
    if (this.pendingReject) {
      this.pendingReject();
      this.pendingReject = null;
    }
  }

  async getStatus(): Promise<TerminalStatus> {
    return {
      connected: true,
      terminalId: 'MOCK-TERMINAL-001',
    };
  }
}
