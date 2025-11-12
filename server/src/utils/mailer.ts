import nodemailer from 'nodemailer';

// Use Brevo’s HTTP API (no SMTP). This avoids provider blocks on ports 25/465/587.
let brevoApi: any | null = null;
let brevoAccountApi: any | null = null;

function getBrevoApi(): any | null {
  const key = process.env.BREVO_API_KEY;
  if (!key) return null;

  if (!brevoApi) {
    // Lazy import to avoid ESM/TS interop headaches on boot
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Brevo = require('@getbrevo/brevo');
    brevoApi = new Brevo.TransactionalEmailsApi();
    // support both old and new typings
    if (brevoApi.authentications && brevoApi.authentications['apiKey']) {
      brevoApi.authentications['apiKey'].apiKey = key;
    } else if (brevoApi.setApiKey) {
      brevoApi.setApiKey(
        require('@getbrevo/brevo').TransactionalEmailsApiApiKeys.apiKey,
        key
      );
    }

    brevoAccountApi = new Brevo.AccountApi();
    if (brevoAccountApi.authentications && brevoAccountApi.authentications['apiKey']) {
      brevoAccountApi.authentications['apiKey'].apiKey = key;
    } else if (brevoAccountApi.setApiKey) {
      brevoAccountApi.setApiKey(
        require('@getbrevo/brevo').AccountApiApiKeys.apiKey,
        key
      );
    }
  }
  return brevoApi;
}

type Transport = nodemailer.Transporter | null;
let smtpTransporter: Transport = null;

function envBool(v: string | undefined, fallback = false): boolean {
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function getSmtpTransport(): Transport {
  if (smtpTransporter) return smtpTransporter;

  const hasSMTP =
    !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

  if (!hasSMTP) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = envBool(process.env.SMTP_SECURE, port === 465);

  smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });

  return smtpTransporter;
}

function getSender() {
  const email =
    process.env.BREVO_SENDER_EMAIL ||
    process.env.MAIL_FROM ||
    'no-reply@taxpal.local';
  const name = process.env.BREVO_SENDER_NAME || 'TaxPal';
  return { email, name };
}

/** Public: send the actual reset email */
export async function sendResetEmail(to: string, resetUrl: string): Promise<void> {
  const { email: fromEmail, name: fromName } = getSender();
  const subject = 'Reset your TaxPal password';
  const html = `
    <p>We received a request to reset your password.</p>
    <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none">Reset password</a></p>
    <p>Or copy this link into your browser:<br>${resetUrl}</p>
    <p><small>This link expires in 30 minutes. If you didn’t request this, you can ignore this email.</small></p>
  `;
  const text = `Reset your password: ${resetUrl} (expires in 30 minutes)`;

  // 1) Try Brevo API first (best for production)
  try {
    const api = getBrevoApi();
    if (api) {
      const Brevo = require('@getbrevo/brevo');
      const payload = new Brevo.SendSmtpEmail();
      payload.subject = subject;
      payload.sender = { email: fromEmail, name: fromName };
      payload.to = [{ email: to }];
      payload.htmlContent = html;
      payload.textContent = text;

      const resp = await api.sendTransacEmail(payload);
      console.log('[mailer] Brevo API sent:', resp?.messageId ?? 'OK');
      return;
    }
  } catch (err: any) {
  const status = err?.response?.status;
  const data = err?.response?.data;
  console.error('[mailer] Brevo API error:', status, data || err?.message || err);
}

  // 2) Else try SMTP (works in localhost; may be blocked in some clouds)
  try {
    const t = getSmtpTransport();
    if (t) {
      const info = await t.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        text,
        html,
      });
      console.log('[mailer] SMTP sent:', info.messageId);
      return;
    }
  } catch (err: any) {
    console.error('[mailer] SMTP error:', err?.message || err);
  }

  // 3) Dev fallback: log link so you can still complete the flow
  console.log(`[DEV][mailer] No email transport configured. Reset URL for ${to}: ${resetUrl}`);
}

/** Called at server start to prove mail is wired in prod */
export async function verifyMailer(): Promise<void> {
  // Prefer Brevo API
  try {
    const api = getBrevoApi();
    if (api && brevoAccountApi) {
      const acct = await brevoAccountApi.getAccount();
      const { email: fromEmail, name: fromName } = getSender();
      console.log(
        `[mailer] Brevo API ready as ${acct?.email || 'unknown account'}. Sender: ${fromName} <${fromEmail}>`
      );
      return;
    }
  } catch (e: any) {
  const status = e?.response?.status;
  const data = e?.response?.data;
  console.warn('[mailer] Brevo API verify failed:', status, data || e?.message || e);
}
  // Else SMTP verify
  try {
    const t = getSmtpTransport();
    if (t) {
      await t.verify();
      const { email: fromEmail, name: fromName } = getSender();
      console.log(
        `[mailer] SMTP ready (${process.env.SMTP_HOST}). Sender: ${fromName} <${fromEmail}>`
      );
      return;
    }
  } catch (e: any) {
    console.warn('[mailer] SMTP verify failed:', e?.message || e);
  }

  console.log('[mailer] DEV mode: no mail transport configured — reset links will be logged.');
}
