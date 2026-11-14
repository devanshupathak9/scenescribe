const { Op } = require('sequelize');
const { User } = require('../models');
const { env } = require('../config/env');
const { todayStr, addDays, hourInAppTz } = require('../utils/date');
const { issueUnsubscribeToken } = require('./tokens');
const email = require('./email');

/**
 * Streak reminders: once a day, from REMINDER_HOUR in APP_TIMEZONE, email every
 * learner who practised yesterday but not yet today — their streak breaks at
 * midnight. Each user is "claimed" with a conditional UPDATE before sending, so
 * a restart or a second replica can never send twice on the same day.
 */
async function runStreakReminders({ cap = env.REMINDER_DAILY_CAP, send = email.sendStreakReminderEmail } = {}) {
  const today = todayStr();
  const sentToday = await User.count({ where: { last_reminder_date: today } });
  const budget = Math.max(0, cap - sentToday);
  if (!budget) return { sent: 0, skipped: 'cap' };

  const due = await User.findAll({
    where: {
      is_registered: true,
      email_reminders: true,
      last_submission_date: addDays(today, -1),
      [Op.or]: [{ last_reminder_date: null }, { last_reminder_date: { [Op.ne]: today } }],
    },
    order: [['curr_streak', 'DESC']], // protect the longest streaks first if we hit the cap
    limit: budget,
  });

  let sent = 0; let failed = 0;
  for (const user of due) {
    const [claimed] = await User.update(
      { last_reminder_date: today },
      { where: { id: user.id, [Op.or]: [{ last_reminder_date: null }, { last_reminder_date: { [Op.ne]: today } }] } },
    );
    if (!claimed) continue;
    try {
      const delivered = await send(user.email, {
        name: (user.full_name || '').split(' ')[0] || null,
        streak: user.curr_streak || 1,
        practiseUrl: `${env.WEB_URL}/?utm_source=email&utm_campaign=streak_reminder`,
        unsubscribeUrl: `${env.WEB_URL}/unsubscribe?t=${encodeURIComponent(issueUnsubscribeToken(user))}`,
      });
      if (delivered) sent++;
    } catch (err) {
      failed++;
      console.error(`[reminders] send failed for ${user.id}: ${err.message}`);
    }
  }
  if (due.length) console.log(`[reminders] ${today}: sent ${sent}, failed ${failed}, due ${due.length}`);
  return { sent, failed, due: due.length };
}

// Checks every 10 minutes; runs once the reminder hour has arrived.
// Per-user claiming makes repeat runs on the same day harmless.
function startReminderScheduler() {
  if (!env.REMINDERS_ENABLED || !email.emailConfigured) {
    console.log(`[reminders] off (${!env.REMINDERS_ENABLED ? 'REMINDERS_ENABLED=false' : 'email not configured'})`);
    return null;
  }
  let lastRun = null;
  const tick = async () => {
    const today = todayStr();
    if (lastRun === today || hourInAppTz() < env.REMINDER_HOUR) return;
    lastRun = today;
    try { await runStreakReminders(); } catch (err) {
      lastRun = null; // retry on the next tick
      console.error('[reminders] run failed:', err.message);
    }
  };
  const timer = setInterval(tick, 10 * 60 * 1000);
  timer.unref();
  setTimeout(tick, 30 * 1000).unref();
  console.log(`[reminders] on — daily from ${env.REMINDER_HOUR}:00 ${env.APP_TIMEZONE}, cap ${env.REMINDER_DAILY_CAP}`);
  return timer;
}

module.exports = { runStreakReminders, startReminderScheduler };
