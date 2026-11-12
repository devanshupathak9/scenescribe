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

module.exports = { sendOTPEmail, emailConfigured: Boolean(smtpConfigured) };
