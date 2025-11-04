// server/src/utils/mailer.ts
import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASS = process.env.GMAIL_APP_PASS;
const MAIL_FROM_RAW = process.env.MAIL_FROM || `TaxPal <${GMAIL_USER || 'no-reply@localhost'}>`;

/**
 * Ensure the "from" address uses the authenticated Gmail (helps avoid DMARC/SPF issues).
 * If MAIL_FROM uses a different address than GMAIL_USER, we keep the display name
 * but force the underlying email to GMAIL_USER.
 */
function normalizeFrom(fromRaw: string, gmailUser?: string) {
  if (!gmailUser) return fromRaw;
  const displayMatch = fromRaw.match(/^(.*)<(.+)>$/); // "Name <email@domain>"
  if (displayMatch) {
    const display = displayMatch[1]?.trim() || 'TaxPal';
    const emailInFrom = displayMatch[2]?.trim().toLowerCase();
    if (emailInFrom && emailInFrom !== gmailUser.toLowerCase()) {
      console.warn('[mailer] MAIL_FROM address differs from GMAIL_USER; using authenticated Gmail to avoid DMARC issues.');
      return `${display} <${gmailUser}>`;
    }
  }
  // If it's just an email or already matches, return as-is.
  return fromRaw;
}

const MAIL_FROM = normalizeFrom(MAIL_FROM_RAW, GMAIL_USER);

let transporter: nodemailer.Transporter | undefined;

export function isRealEmailEnabled(): boolean {
  return Boolean(GMAIL_USER && GMAIL_APP_PASS);
}

export function getTransporter() {
  if (transporter) return transporter;

  if (isRealEmailEnabled()) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASS }
    });
  } else {
    // Dev fallback: no real emails, but logs the full payload to console
    transporter = nodemailer.createTransport({ jsonTransport: true } as any);
    console.warn('[mailer] Using JSON transport (no real emails will be sent).');
  }

  return transporter;
}

export async function verifyMailer() {
  try {
    await getTransporter().verify();
    console.log('[mailer] transport verified and ready. From:', MAIL_FROM);
  } catch (e: any) {
    console.warn('[mailer] verification failed:', e?.message || e);
  }
}

export async function sendResetEmail(to: string, resetUrl: string) {
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.6;">
      <h2 style="margin:0 0 12px">Reset your TaxPal password</h2>
      <p>We received a request to reset the password for your account.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#4f46e5;color:#fff;text-decoration:none;">Reset Password</a></p>
      <p>If the button doesn't work, copy and paste this URL into your browser:</p>
      <p style="word-break:break-all;"><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link will expire in 30 minutes. If you didn't request this, you can ignore this email.</p>
      <hr/>
      <p style="color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} TaxPal</p>
    </div>
  `;

  const text = `Reset your TaxPal password:
${resetUrl}

This link expires in 30 minutes. If you didn't request this, ignore this email.`;

  const info = await getTransporter().sendMail({
    from: MAIL_FROM, // keep the authenticated Gmail as the underlying address
    to,
    subject: 'TaxPal — Reset your password',
    text,
    html
  });

  if ((info as any).message) {
    // JSON transport path (dev): log full payload for quick debugging
    const msg = (info as any).message.toString?.() || (info as any).message;
    console.log('[mailer] (jsonTransport) email payload:', msg);
  } else {
    console.log(`[mailer] sent reset email to ${to} via ${isRealEmailEnabled() ? 'smtp.gmail.com' : 'jsonTransport'}`);
  }
}
