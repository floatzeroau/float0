// ---------------------------------------------------------------------------
// Terminal Service Interface
// ---------------------------------------------------------------------------

export interface TerminalResult {
  success: boolean;
  approvalCode?: string;
  cardType?: string;
  lastFour?: string;
  errorMessage?: string;
}

export interface TerminalStatus {
  connected: boolean;
  terminalId?: string;
}

export interface ITerminalService {
  sendPayment(amount: number): Promise<TerminalResult>;
  sendRefund(amount: number, originalRef: string): Promise<TerminalResult>;
  cancelTransaction(): Promise<void>;
  getStatus(): Promise<TerminalStatus>;
}
