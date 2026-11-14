const nodemailer = require('nodemailer');

const smtpConfigured =
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS;

// Only build the transporter when credentials are present
const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_PORT === '465',
      // Fail fast: a stuck SMTP server must not hang the sign-up request.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

const COPY = {
  register: { subject: 'SceneScribe — Verify your email', heading: 'Verify your email', lead: 'Use the code below to verify your SceneScribe account.' },
  reset:    { subject: 'SceneScribe — Reset your password', heading: 'Reset your password', lead: 'Use the code below to set a new SceneScribe password.' },
};

async function sendOTPEmail(to, otp, purpose = 'register') {
  const copy = COPY[purpose] || COPY.register;
  // Dev fallback — when SMTP is not configured, print the OTP to the server
  // console so you can still test the full registration flow locally.
  if (!smtpConfigured || !transporter) {
    if (process.env.NODE_ENV === 'test') return;
    console.log('─────────────────────────────────────────');
    console.log('[EMAIL SERVICE] SMTP not configured.');
    console.log(`  To  : ${to} (${purpose})`);
    console.log(`  OTP : ${otp}`);
    console.log('  (Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env to send real emails)');
    console.log('─────────────────────────────────────────');
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: copy.subject,
    text: `${copy.lead}\n\nYour code is: ${otp}\n\nThis code expires in 10 minutes. If you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
        <h2 style="margin-bottom: 8px;">${copy.heading}</h2>
        <p style="color: #444; margin-bottom: 24px;">${copy.lead} It expires in <strong>10 minutes</strong>.</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 10px; text-align: center; padding: 24px 16px; background: #f4f4f4; border-radius: 8px;">
          ${otp}
        </div>
        <p style="color: #999; font-size: 13px; margin-top: 24px;">If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "Your N-day streak ends tonight." Returns false when email isn't configured.
async function sendStreakReminderEmail(to, { name, streak, practiseUrl, unsubscribeUrl }) {
  const days = `${streak}-day`;
  const subject = streak > 1 ? `Your ${days} streak ends tonight` : 'Keep your streak going today';
  const hi = name ? `Hi ${name},` : 'Hi,';
  const lead = streak > 1
    ? `You've practised ${streak} days in a row. One short scene today keeps the streak alive.`
    : 'You practised yesterday. Do one short scene today to start a streak.';

  if (!smtpConfigured || !transporter) {
    if (process.env.NODE_ENV !== 'test') console.log(`[EMAIL SERVICE] SMTP not configured — would send streak reminder to ${to} (${streak})`);
    return false;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
    },
    text: `${hi}\n\n${lead} It takes about 3 minutes.\n\nPractise now: ${practiseUrl}\n\n—\nDon't want these reminders? Turn them off: ${unsubscribeUrl}`,
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 460px; margin: 0 auto; padding: 24px; color: #1a1a24;">
        <p style="font-size: 15px; margin: 0 0 16px;">${escapeHtml(hi)}</p>
        <div style="font-size: 40px; font-weight: 800; margin: 0 0 4px;">🔥 ${streak}</div>
        <p style="font-size: 13px; color: #777; margin: 0 0 20px; text-transform: uppercase; letter-spacing: .06em;">day streak</p>
        <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px;">${escapeHtml(lead)} It takes about 3 minutes.</p>
        <a href="${practiseUrl}" style="display: inline-block; background: #e8ff47; color: #111; font-weight: 700; text-decoration: none; padding: 14px 26px; border-radius: 12px;">Practise now</a>
        <p style="color: #999; font-size: 12px; margin-top: 32px; line-height: 1.5;">
          You get this because daily reminders are on in SceneScribe.
          <a href="${unsubscribeUrl}" style="color: #999;">Turn off reminders</a>
        </p>
      </div>
    `,
  });
  return true;
}

module.exports = { sendOTPEmail, sendStreakReminderEmail, emailConfigured: Boolean(smtpConfigured) };
