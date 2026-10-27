import nodemailer from 'nodemailer';

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function createMailTransport() {
  if (!smtpConfigured()) {
    const error = new Error('Configure SMTP_HOST, SMTP_FROM, SMTP_USER y SMTP_PASS en .env');
    error.status = 503;
    throw error;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('SMTP_PORT no es válido');
    error.status = 503;
    throw error;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_SECURE !== 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });
}

export async function sendMail(to, subject, text, html) {
  const transport = createMailTransport();
  try { return await transport.sendMail({from: process.env.SMTP_FROM, to, subject, text, html}); }
  finally { transport.close(); }
}
