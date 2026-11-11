const { env } = require('../config/env');

// YYYY-MM-DD for an instant, in the app timezone (APP_TIMEZONE).
function dateInAppTz(date = new Date()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function todayStr() {
  return dateInAppTz(new Date());
}

// Calendar arithmetic on YYYY-MM-DD strings (timezone-free).
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

module.exports = { todayStr, dateInAppTz, addDays };
