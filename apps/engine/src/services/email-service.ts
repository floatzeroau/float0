import type { ReceiptData } from '@float0/shared';

// ---------------------------------------------------------------------------
// Email Service Interface
// ---------------------------------------------------------------------------

export interface InviteEmailData {
  recipientName: string;
  orgName: string;
  inviterName: string;
  role: string;
  setupUrl: string;
}

export interface IEmailService {
  sendReceipt(to: string, receiptData: ReceiptData): Promise<boolean>;
  sendInvite(to: string, data: InviteEmailData): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Stub Email Service — logs to console
// ---------------------------------------------------------------------------

export class StubEmailService implements IEmailService {
  async sendReceipt(to: string, receiptData: ReceiptData): Promise<boolean> {
    console.log(`[StubEmail] Would send receipt to ${to} for order ${receiptData.orderNumber}`);
    return true;
  }

  async sendInvite(to: string, data: InviteEmailData): Promise<boolean> {
    console.log(
      `[StubEmail] Would send invite to ${to} — ${data.recipientName} invited to ${data.orgName} as ${data.role}`,
    );
    console.log(`[StubEmail] Setup URL: ${data.setupUrl}`);
    return true;
  }
}

// ---------------------------------------------------------------------------
// MailerSend Email Service — placeholder for future implementation
// ---------------------------------------------------------------------------

export class MailerSendEmailService implements IEmailService {
  constructor(private readonly apiKey: string) {}

  async sendReceipt(_to: string, _receiptData: ReceiptData): Promise<boolean> {
    // TODO: Implement MailerSend API integration
    throw new Error('MailerSend email service not yet implemented');
  }

  async sendInvite(_to: string, _data: InviteEmailData): Promise<boolean> {
    // TODO: Implement MailerSend API integration
    throw new Error('MailerSend email service not yet implemented');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let instance: IEmailService | null = null;

export function getEmailService(): IEmailService {
  if (!instance) {
    const apiKey = process.env.MAILERSEND_API_KEY;
    if (apiKey) {
      instance = new MailerSendEmailService(apiKey);
    } else {
      instance = new StubEmailService();
    }
  }
  return instance;
}
