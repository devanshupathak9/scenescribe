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

// Minutes the app timezone is ahead of UTC at a given instant.
function tzOffsetMinutes(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: env.APP_TIMEZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant).map(p => [p.type, p.value]));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

// The instant the next calendar day starts in the app timezone (when new scenes go live).
function nextDayStartISO(now = new Date()) {
  const tomorrow = addDays(dateInAppTz(now), 1);
  const guess = new Date(`${tomorrow}T00:00:00Z`);
  return new Date(guess.getTime() - tzOffsetMinutes(guess) * 60000).toISOString();
}

module.exports = { todayStr, dateInAppTz, addDays, nextDayStartISO };
