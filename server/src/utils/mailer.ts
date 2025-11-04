// server/src/utils/mailer.ts
import nodemailer from 'nodemailer';
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
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    });
  }

  // Gmail (2FA + App Password)
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASS! },
  });
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
    process.env.MAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.GMAIL_USER ||
    'TaxPal <onboarding@resend.dev>'; // safe default for Resend
  return { subject, html, text, from };
}

/** Send via Resend HTTP API (preferred in prod) */
async function tryResend(to: string, resetUrl: string): Promise<boolean> {
  const r = getResend();
  if (!r) return false;
  const { subject, html, text, from } = buildMessage(resetUrl);
  await r.emails.send({ from, to, subject, html, text });
  return true;
}

/** Send via SMTP (works locally; can time out on some hosts) */
async function trySMTP(to: string, resetUrl: string): Promise<boolean> {
  const t = getTransport();
  if (!t) return false;
  const { subject, html, text, from } = buildMessage(resetUrl);
  const info = await t.sendMail({ from, to, subject, html, text });
  console.log('[mailer] sent via SMTP id:', info.messageId);
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log('[mailer] preview URL:', preview);
  return true;
}

/** Public API: verify on boot (non-fatal) */
export async function verifyMailer(): Promise<void> {
  if (getResend()) {
    console.log('[mailer] Resend ready');
    return;
  }
  const t = getTransport();
  if (!t) {
    console.log('[mailer] No mail provider configured — will log reset links.');
    return;
  }
  try {
    await t.verify();
    console.log('[mailer] SMTP transport verified and ready.');
  } catch (e: any) {
    console.warn('[mailer] transport verification failed:', e?.message || e);
  }
}

/** Public API: send email; prefer HTTP; fall back to SMTP; never throw */
export async function sendResetEmail(to: string, resetUrl: string): Promise<void> {
  try {
    if (await tryResend(to, resetUrl)) return;
  } catch (e: any) {
    console.warn('[mailer] Resend error:', e?.message || e);
  }

  try {
    if (await trySMTP(to, resetUrl)) return;
  } catch (e: any) {
    console.warn('[mailer] SMTP error:', e?.message || e);
  }

  // Final fallback: just log the link
  console.log(`[DEV][sendResetEmail] No mail sent. Reset URL for ${to}: ${resetUrl}`);
}

/** Fire-and-forget wrapper to avoid blocking HTTP requests */
export function sendResetEmailAsync(to: string, resetUrl: string): void {
  // Don’t block route: run in background and log errors
  Promise.race([
    sendResetEmail(to, resetUrl),
    new Promise((_r, rej) => setTimeout(() => rej(new Error('mail timeout')), 1500)),
  ]).catch(err => console.warn('[mailer] async send skipped:', err?.message || err));
}
