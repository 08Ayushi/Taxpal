// server/src/utils/mailer.ts
import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { Resend } from 'resend';

type Transport = nodemailer.Transporter | null;
let transporter: Transport = null;
let resend: Resend | null = null;

function envBool(v: string | undefined, fallback = false): boolean {
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function buildResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function buildTransport(): Transport {
  const hasSMTP = !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
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

  // Gmail app password (works locally; may time out on some hosts)
  const gmailOptions: SMTPTransport.Options = {
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASS! },
  };
  return nodemailer.createTransport(gmailOptions);
}

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

function buildMessage(resetUrl: string) {
  const subject = 'Reset your TaxPal password';
  const html = `
    <p>We received a request to reset your password.</p>
    <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none">Reset password</a></p>
    <p>Or copy this link into your browser:<br>${resetUrl}</p>
    <p><small>This link expires in 30 minutes. If you didn’t request this, ignore this email.</small></p>
  `;
  const text = `Reset your password: ${resetUrl} (expires in 30 minutes)`;
  const from =
    process.env.MAIL_FROM || // e.g. 'TaxPal <onboarding@resend.dev>' or 'TaxPal <noreply@yourdomain.com>'
    process.env.SMTP_FROM ||
    process.env.GMAIL_USER ||
    'TaxPal <onboarding@resend.dev>';
  return { subject, html, text, from };
}

// --- send via Resend HTTP ---
async function tryResend(to: string, resetUrl: string): Promise<boolean> {
  const r = getResend();
  if (!r) return false;
  const { subject, html, text, from } = buildMessage(resetUrl);

  const { data, error } = await r.emails.send({
    from,
    to,
    subject,
    html,
    text,
    // reply_to: process.env.REPLY_TO || undefined,
  });

  if (error) throw new Error(error.message || JSON.stringify(error));
  console.log('[mailer] Resend accepted id:', data?.id);
  return true;
}

// --- send via SMTP (Gmail/other) ---
async function trySMTP(to: string, resetUrl: string): Promise<boolean> {
  const t = getTransport();
  if (!t) return false;
  const { subject, html, text, from } = buildMessage(resetUrl);
  const info = await t.sendMail({ from, to, subject, html, text });
  console.log('[mailer] SMTP sent id:', info.messageId);
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log('[mailer] preview URL:', preview);
  return true;
}

export async function verifyMailer(): Promise<void> {
  const hasResend = !!getResend();
  const t = getTransport();

  if (hasResend) {
    console.log('[mailer] Resend ready');
    return;
  }
  if (t) {
    try {
      await t.verify();
      console.log('[mailer] SMTP transport verified and ready.');
    } catch (e: any) {
      console.warn('[mailer] SMTP verify failed:', e?.message || e);
    }
    return;
  }
  console.log('[mailer] No mail provider configured — will log reset links (console fallback).');
}

/**
 * Returns true if an email was actually submitted to a provider (Resend/SMTP).
 * Returns false if we could not submit (console fallback).
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

  console.log(`[DEV][sendResetEmail] No mail sent. Reset URL for ${to}: ${resetUrl}`);
  return false;
}


export function sendResetEmailAsync(to: string, resetUrl: string): void {
  // return quickly; cap long providers with a short timeout
  Promise.race([
    sendResetEmail(to, resetUrl),
    new Promise((_r, rej) => setTimeout(() => rej(new Error('mail timeout')), 1500)),
  ]).catch(err => console.warn('[mailer] async send skipped:', err?.message || err));
}

