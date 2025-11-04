// src/utils/mailer.ts  (or server/src/utils/mailer.ts)
import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { Resend } from 'resend';

type Transport = nodemailer.Transporter | null;
let transporter: Transport = null;
let resend: Resend | null = null;

/** Parse boolean-ish env values */
function envBool(v: string | undefined, fallback = false): boolean {
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

/** Prefer HTTP API (Resend) in prod to avoid SMTP blocks on hosts */
function buildResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

/** Build SMTP transporter (works locally; many hosts block on free tiers) */
function buildTransport(): Transport {
  const hasSMTP =
    !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
  const hasGmail = !!process.env.GMAIL_USER && !!process.env.GMAIL_APP_PASS;

  if (!hasSMTP && !hasGmail) return null;

  if (hasSMTP) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = envBool(process.env.SMTP_SECURE, port === 465);
    const smtpOptions: SMTPTransport.Options = {
      host: process.env.SMTP_HOST!,
      port,
      secure,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    };
    return nodemailer.createTransport(smtpOptions);
  }

  // Gmail (2FA + App Password)
  const gmailOptions: SMTPTransport.Options = {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASS! },
  };
  return nodemailer.createTransport(gmailOptions);
}

/** Lazy init so .env is loaded */
function getTransport(): Transport {
  if (transporter) return transporter;
  transporter = buildTransport();
  return transporter;
}
function getResend(): Resend | null {
  if (resend) return resend;
  resend = buildResend();
  return resend;
}

/** Common message */
function buildMessage(resetUrl: string) {
  const subject = 'Reset your TaxPal password';
  const html = `
    <p>We received a request to reset your password.</p>
    <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none">Reset password</a></p>
    <p>Or copy this link into your browser:<br>${resetUrl}</p>
    <p><small>This link expires in 30 minutes. If you didn’t request this, you can ignore this email.</small></p>
  `;
  const text = `Reset your password: ${resetUrl} (expires in 30 minutes)`;
  const from =
    process.env.MAIL_FROM || // e.g., "TaxPal <onboarding@resend.dev>" or your domain sender
    process.env.SMTP_FROM ||
    process.env.GMAIL_USER ||
    'TaxPal <onboarding@resend.dev>'; // safe default for Resend
  const replyTo = process.env.MAIL_REPLY_TO || undefined; // optional
  return { subject, html, text, from, replyTo };
}

/** Try Resend (HTTP). Returns true if sent. */
async function tryResend(to: string, resetUrl: string): Promise<boolean> {
  const r = getResend();
  if (!r) return false;
  const { subject, html, text, from, replyTo } = buildMessage(resetUrl);
  const payload: any = { from, to, subject, html, text };
  if (replyTo) payload.reply_to = replyTo;
  const res = await r.emails.send(payload);
  if ((res as any)?.error) throw new Error(JSON.stringify((res as any).error));
  return true;
}

/** Try SMTP (Gmail/other). Returns true if sent. */
async function trySMTP(to: string, resetUrl: string): Promise<boolean> {
  const t = getTransport();
  if (!t) return false;
  const { subject, html, text, from, replyTo } = buildMessage(resetUrl);
  const info = await t.sendMail({ from, to, subject, html, text, replyTo });
  console.log('[mailer] sent via SMTP id:', info.messageId);
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log('[mailer] preview URL:', preview);
  return true;
}

/** Verify on boot (non-fatal). Logs the active mode. */
export async function verifyMailer(): Promise<void> {
  const hasResend = !!getResend();
  const hasSMTP = !!getTransport();

  if (hasResend) {
    console.log('[mailer] Resend ready');
    return;
  }
  if (hasSMTP) {
    try {
      await transporter!.verify();
      console.log('[mailer] SMTP transport verified and ready.');
    } catch (e: any) {
      console.warn('[mailer] SMTP verify failed:', e?.message || e);
    }
    return;
  }
  console.log('[mailer] No mail provider configured — will log reset links (console fallback).');
}

/**
 * Send reset email.
 * Returns true if an email was actually sent (Resend or SMTP).
 * Returns false if nothing could be sent (console fallback only).
 */
export async function sendResetEmail(to: string, resetUrl: string): Promise<boolean> {
  try {
    if (await tryResend(to, resetUrl)) return true;
  } catch (e: any) {
    console.warn('[mailer] Resend error:', e?.message || e);
  }

  try {
    if (await trySMTP(to, resetUrl)) return true;
  } catch (e: any) {
    console.warn('[mailer] SMTP error:', e?.message || e);
  }

  // Final fallback: just log the link (useful in dev/console mode)
  console.log(`[DEV][sendResetEmail] No mail sent. Reset URL for ${to}: ${resetUrl}`);
  return false;
}
