import type { ReceiptData } from '@float0/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export function buildReceiptEmailHtml(data: ReceiptData): string {
  const isFullTaxInvoice = data.invoiceType === 'full_tax_invoice';
  const orderTypeLabel = data.orderType === 'dine_in' ? 'Dine In' : 'Takeaway';

  const itemRows = data.items
    .map((item) => {
      const modifiers = item.modifiers.length
        ? `<br/><span style="color:#666;font-size:13px;">${item.modifiers.map((m) => `+ ${esc(m)}`).join('<br/>')}</span>`
        : '';
      const voided = item.isVoided
        ? '<br/><span style="color:#dc2626;font-weight:600;">VOIDED</span>'
        : '';
      const gstFree = item.isGstFree
        ? '<br/><span style="color:#666;font-size:12px;">(GST Free)</span>'
        : '';
      const discount =
        item.discountAmount > 0
          ? `<br/><span style="color:#059669;font-size:13px;">Discount: -${formatCurrency(item.discountAmount)}</span>`
          : '';

      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;vertical-align:top;">
            ${item.quantity}x ${esc(item.name)}${modifiers}${discount}${voided}${gstFree}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:top;">
            ${formatCurrency(item.lineTotal)}
          </td>
        </tr>`;
    })
    .join('\n');

  const paymentRows = data.payments
    .map((p) => {
      const label =
        p.method === 'card'
          ? `${p.cardType ?? 'Card'}${p.lastFour ? ` ****${p.lastFour}` : ''}`
          : 'Cash';
      let extra = '';
      if (p.tenderedAmount != null) {
        extra += `<br/><span style="color:#666;">Tendered: ${formatCurrency(p.tenderedAmount)}</span>`;
      }
      if (p.changeGiven != null && p.changeGiven > 0) {
        extra += `<br/><span style="color:#666;">Change: ${formatCurrency(p.changeGiven)}</span>`;
      }
      if (p.tipAmount > 0) {
        extra += `<br/><span style="color:#059669;">Tip: ${formatCurrency(p.tipAmount)}</span>`;
      }
      return `
        <tr>
          <td style="padding:4px 0;">${esc(label)}${extra}</td>
          <td style="padding:4px 0;text-align:right;">${formatCurrency(p.amount)}</td>
        </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Receipt - ${esc(data.orderNumber)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;">
<tr><td align="center" style="padding:24px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">

<!-- Header -->
<tr>
<td style="background-color:#1a1a1a;padding:24px;text-align:center;">
  ${isFullTaxInvoice ? '<p style="color:#fbbf24;font-size:18px;font-weight:700;margin:0 0 8px;">TAX INVOICE</p>' : ''}
  <h1 style="color:#ffffff;font-size:20px;margin:0;">${esc(data.businessName)}</h1>
  <p style="color:#a0a0a0;font-size:13px;margin:8px 0 0;">${esc(data.address)}</p>
  <p style="color:#a0a0a0;font-size:13px;margin:4px 0 0;">Ph: ${esc(data.phone)}</p>
  <p style="color:#a0a0a0;font-size:13px;margin:4px 0 0;">ABN: ${esc(data.abn)}</p>
  ${data.headerText ? `<p style="color:#d4d4d4;font-size:13px;margin:8px 0 0;">${esc(data.headerText)}</p>` : ''}
</td>
</tr>

<!-- Order Info -->
<tr>
<td style="padding:16px 24px;background-color:#fafafa;border-bottom:1px solid #e5e5e5;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="font-size:15px;font-weight:600;">Order ${esc(data.orderNumber)}</td>
      <td style="text-align:right;font-size:14px;color:#666;">${esc(orderTypeLabel)}</td>
    </tr>
    <tr>
      <td style="font-size:13px;color:#666;padding-top:4px;">${formatDate(data.dateTime)}</td>
      <td style="text-align:right;font-size:13px;color:#666;padding-top:4px;">${data.tableNumber ? `Table ${esc(data.tableNumber)}` : ''}</td>
    </tr>
    ${data.customerName ? `<tr><td colspan="2" style="font-size:13px;color:#666;padding-top:4px;">Customer: ${esc(data.customerName)}</td></tr>` : ''}
  </table>
</td>
</tr>

<!-- Items -->
<tr>
<td style="padding:16px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
    ${itemRows}
  </table>
</td>
</tr>

<!-- Totals -->
<tr>
<td style="padding:0 24px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
    <tr>
      <td style="padding:4px 0;color:#666;">Subtotal</td>
      <td style="padding:4px 0;text-align:right;">${formatCurrency(data.subtotal)}</td>
    </tr>
    ${data.discountTotal > 0 ? `<tr><td style="padding:4px 0;color:#059669;">Discount</td><td style="padding:4px 0;text-align:right;color:#059669;">-${formatCurrency(data.discountTotal)}</td></tr>` : ''}
    <tr>
      <td style="padding:4px 0;color:#666;">${isFullTaxInvoice ? 'Total GST' : 'GST (incl)'}</td>
      <td style="padding:4px 0;text-align:right;">${formatCurrency(data.gstAmount)}</td>
    </tr>
    <tr>
      <td style="padding:8px 0 4px;font-size:18px;font-weight:700;border-top:2px solid #1a1a1a;">TOTAL</td>
      <td style="padding:8px 0 4px;font-size:18px;font-weight:700;text-align:right;border-top:2px solid #1a1a1a;">${formatCurrency(data.total)}</td>
    </tr>
    ${!isFullTaxInvoice ? `<tr><td colspan="2" style="padding:2px 0;font-size:12px;color:#666;">Total includes GST of ${formatCurrency(data.gstAmount)}</td></tr>` : ''}
  </table>
</td>
</tr>

<!-- Payments -->
<tr>
<td style="padding:0 24px 16px;">
  <p style="font-size:12px;font-weight:600;color:#999;text-transform:uppercase;margin:0 0 8px;">Payment</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
    ${paymentRows}
  </table>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:16px 24px;background-color:#fafafa;border-top:1px solid #e5e5e5;text-align:center;">
  <p style="font-size:14px;color:#666;margin:0;">${esc(data.footerText ?? 'Thank you!')}</p>
  ${data.socialMedia ? `<p style="font-size:13px;color:#999;margin:4px 0 0;">${esc(data.socialMedia)}</p>` : ''}
</td>
</tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

export function buildReceiptEmailSubject(data: ReceiptData): string {
  return `Your receipt from ${data.businessName} - Order ${data.orderNumber}`;
}
