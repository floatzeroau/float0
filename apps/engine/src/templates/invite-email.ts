function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface InviteEmailParams {
  recipientName: string;
  orgName: string;
  inviterName: string;
  role: string;
  setupUrl: string;
}

export function buildInviteEmailHtml(params: InviteEmailParams): string {
  const { recipientName, orgName, inviterName, role, setupUrl } = params;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2>You've been invited to ${esc(orgName)}</h2>
  <p>Hi ${esc(recipientName)},</p>
  <p>${esc(inviterName)} has invited you to join <strong>${esc(orgName)}</strong> as a <strong>${esc(role)}</strong>.</p>
  <p>Click the button below to set up your account:</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${esc(setupUrl)}" style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Set Up Account</a>
  </p>
  <p style="color: #666; font-size: 14px;">This link expires in 72 hours.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">If you didn't expect this invitation, you can safely ignore this email.</p>
</body>
</html>`;
}
