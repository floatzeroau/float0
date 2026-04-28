import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import type { ReceiptData } from '@float0/shared';
import { colors, spacing, radii, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReceiptPreviewProps {
  data: ReceiptData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RECEIPT_WIDTH = 320;
const LINE_CHAR_COUNT = 38; // approximate chars per line at font size 12

function pad(left: string, right: string): string {
  const gap = LINE_CHAR_COUNT - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

function center(text: string): string {
  const padding = Math.max(0, Math.floor((LINE_CHAR_COUNT - text.length) / 2));
  return ' '.repeat(padding) + text;
}

function divider(char = '-'): string {
  return char.repeat(LINE_CHAR_COUNT);
}

function formatCurrency(amount: number): string {
  const prefix = amount < 0 ? '-$' : '$';
  return `${prefix}${Math.abs(amount).toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

function orderTypeLabel(type: string): string {
  return type === 'dine_in' ? 'Dine In' : 'Takeaway';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReceiptPreview({ data }: ReceiptPreviewProps) {
  const lines: string[] = [];
  const isFullTaxInvoice = data.invoiceType === 'full_tax_invoice';

  // Reprint watermark
  if (data.reprintDate) {
    lines.push(center('*** REPRINT ***'));
    lines.push(center(`Reprinted: ${formatDate(data.reprintDate)}`));
    lines.push('');
  }

  // Header
  lines.push(divider('='));
  if (isFullTaxInvoice) {
    lines.push(center('TAX INVOICE'));
    lines.push('');
  }
  lines.push(center(data.businessName.toUpperCase()));
  lines.push(center(data.address));
  lines.push(center(`Ph: ${data.phone}`));
  lines.push(center(`ABN: ${data.abn}`));
  if (data.headerText) {
    lines.push(center(data.headerText));
  }
  lines.push(divider('='));

  // Order info
  lines.push(pad(`Order: ${data.orderNumber}`, orderTypeLabel(data.orderType)));
  lines.push(`Date: ${formatDate(data.dateTime)}`);
  lines.push(`Staff: ${data.staffName}`);
  if (data.tableNumber) {
    lines.push(`Table: ${data.tableNumber}`);
  }
  if (data.customerName) {
    lines.push(`Customer: ${data.customerName}`);
  }

  lines.push(divider());

  // Items
  for (const item of data.items) {
    const qtyStr = `${item.quantity}x`;
    const priceStr = formatCurrency(item.lineTotal);
    lines.push(pad(`${qtyStr}  ${item.name}`, priceStr));

    for (const mod of item.modifiers) {
      lines.push(`    + ${mod}`);
    }

    if (item.discountAmount > 0) {
      lines.push(`    Discount: -${formatCurrency(item.discountAmount)}`);
    }

    if (item.isVoided) {
      lines.push('      ** VOIDED **');
    }

    if (item.isGstFree) {
      lines.push('      (GST Free)');
    }
  }

  lines.push(divider());

  // Totals
  lines.push(pad('Subtotal', formatCurrency(data.subtotal)));
  if (data.discountTotal > 0) {
    lines.push(pad('Discount', `-${formatCurrency(data.discountTotal)}`));
  }

  if (isFullTaxInvoice) {
    lines.push(pad('Total GST', formatCurrency(data.gstAmount)));
  } else {
    lines.push(pad('GST (incl)', formatCurrency(data.gstAmount)));
  }

  lines.push(divider());
  lines.push(pad('TOTAL', formatCurrency(data.total)));

  if (!isFullTaxInvoice) {
    lines.push(`Total includes GST of ${formatCurrency(data.gstAmount)}`);
  }

  lines.push(divider());

  // Payments
  for (const payment of data.payments) {
    const label =
      payment.method === 'card'
        ? `${payment.cardType ?? 'Card'}${payment.lastFour ? ` ****${payment.lastFour}` : ''}`
        : 'CASH';
    lines.push(pad(label, formatCurrency(payment.amount)));

    if (payment.tenderedAmount != null) {
      lines.push(pad('Tendered', formatCurrency(payment.tenderedAmount)));
    }
    if (payment.changeGiven != null && payment.changeGiven > 0) {
      lines.push(pad('Change', formatCurrency(payment.changeGiven)));
    }
    if (payment.roundingAmount != null && payment.roundingAmount !== 0) {
      lines.push(pad('Rounding', formatCurrency(payment.roundingAmount)));
    }
    if (payment.approvalCode) {
      lines.push(pad('Approval', payment.approvalCode));
    }
    if (payment.tipAmount > 0) {
      lines.push(pad('Tip', formatCurrency(payment.tipAmount)));
    }
  }

  // Footer
  lines.push(divider('='));
  if (data.footerText) {
    lines.push(center(data.footerText));
  } else {
    lines.push(center('Thank you!'));
  }
  if (data.socialMedia) {
    lines.push(center(data.socialMedia));
  }
  lines.push(divider('='));

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.paper}>
        {lines.map((line, i) => (
          <Text key={i} style={styles.line}>
            {line}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const monoFont = Platform.select({
  ios: 'Courier',
  android: 'monospace',
  default: 'monospace',
});

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 360,
    width: RECEIPT_WIDTH,
  },
  scrollContent: {
    flexGrow: 1,
  },
  paper: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radii.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  line: {
    fontFamily: monoFont,
    fontSize: typography.size.sm,
    lineHeight: 18,
    color: colors.textPrimary,
  },
});
