// server/src/utils/mailer.ts
import nodemailer from 'nodemailer';
import SibApiV3Sdk from 'sib-api-v3-sdk';

/** Prefer Brevo v3 API if we have an xkeysib- key; otherwise use SMTP (e.g., Brevo smtp-relay). */

const hasBrevoApiKey = () => {
  const k = (process.env.BREVO_API_KEY || '').trim();
  return /^xkeysib-/.test(k); // Brevo v3 API keys look like xkeysib-...
};

function sender() {
  return {
    email: process.env.BREVO_SENDER_EMAIL || 'no-reply@taxpal.local',
    name: process.env.BREVO_SENDER_NAME || 'TaxPal',
  };
}

async function sendViaBrevoApi(
  to: string,
  subject: string,
  htmlContent: string,
  textContent: string
) {
  const client = SibApiV3Sdk.ApiClient.instance;
  (client.authentications['api-key'] as any).apiKey = process.env.BREVO_API_KEY!;
  const api = new SibApiV3Sdk.TransactionalEmailsApi();

  const payload: SibApiV3Sdk.SendSmtpEmail = {
    sender: sender(),
    to: [{ email: to }],
    subject,
    htmlContent,
    textContent,
  };

  return api.sendTransacEmail(payload);
}

async function sendViaSmtp(
  to: string,
  subject: string,
  htmlContent: string,
  textContent: string
) {
  // Works with Brevo’s SMTP relay or any SMTP
  const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' ||
    port === 465;

  const user = process.env.SMTP_USER; // usually your Brevo account email
  const pass = process.env.SMTP_PASS; // your Brevo SMTP key (xsmtpsib-...)

  if (!user || !pass) {
    console.warn('[mailer] Missing SMTP_USER/SMTP_PASS; cannot send via SMTP.');
    return null;
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return transport.sendMail({
    from: `"${sender().name}" <${sender().email}>`,
    to,
    subject,
    html: htmlContent,
    text: textContent,
  });
}

export async function sendResetEmail(to: string, resetUrl: string): Promise<void> {
  const subject = 'Reset your TaxPal password';
  const htmlContent = `
    <p>We received a request to reset your password.</p>
    <p>
      <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none">
        Reset password
      </a>
    </p>
    <p>Or copy this link into your browser:<br>${resetUrl}</p>
    <p><small>This link expires in 30 minutes. If you didn’t request this, you can ignore this email.</small></p>
  `;
  const textContent = `Reset your password: ${resetUrl} (expires in 30 minutes)`;

  try {
    if (hasBrevoApiKey()) {
      const resp = await sendViaBrevoApi(to, subject, htmlContent, textContent);
      console.log('[mailer] Brevo API sent:', (resp as any)?.messageId || 'ok');
      return;
    }

    const info = await sendViaSmtp(to, subject, htmlContent, textContent);
    if (info) {
      console.log('[mailer] SMTP sent:', (info as any)?.messageId || 'ok');
      return;
    }

    console.log(`[DEV][sendResetEmail] No mail transport configured. Reset URL for ${to}: ${resetUrl}`);
  } catch (e: any) {
    console.error('[mailer] sendResetEmail error:', e?.message || e);
  }
}

export async function verifyMailer(): Promise<void> {
  try {
    if (hasBrevoApiKey()) {
      const client = SibApiV3Sdk.ApiClient.instance;
      (client.authentications['api-key'] as any).apiKey = process.env.BREVO_API_KEY!;
      const account = await new SibApiV3Sdk.AccountApi().getAccount();
      console.log(
        `[mailer] Brevo API ready as ${account.email}. Sender: ${sender().name} <${sender().email}>`
      );
      return;
    }

    // SMTP verification
    const host = process.env.SMTP_HOST || '';
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';

    if (host && user && pass) {
      const port = Number(process.env.SMTP_PORT || 587);
      const secure =
        String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' ||
        port === 465;

      const t = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
      await t.verify();
      console.log(
        `[mailer] SMTP ready (${host}). Sender: ${sender().name} <${sender().email}>`
      );
      return;
    }

    console.log('[mailer] No Brevo API key or SMTP creds — will log reset links to console.');
  } catch (e: any) {
    console.warn('[mailer] verify failed:', e?.message || e);
  }
}
