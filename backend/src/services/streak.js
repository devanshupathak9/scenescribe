const { todayStr, addDays } = require('../utils/date');

// The stored curr_streak is only updated on submission, so a user who skipped
// days would still see their old streak. Compute what is actually current.
function effectiveStreak(user, today = todayStr()) {
  const last = user.last_submission_date;
  if (!last) return 0;
  if (last === today || last === addDays(today, -1)) return user.curr_streak || 0;
  return 0;
}

// Streak fields after a completed practice on `today`.
function nextStreak(user, today = todayStr()) {
  const last = user.last_submission_date;
  let curr;
  if (last === today) curr = user.curr_streak || 1;
  else if (last === addDays(today, -1)) curr = (user.curr_streak || 0) + 1;
  else curr = 1;
  return {
    curr_streak: curr,
    longest_streak: Math.max(user.longest_streak || 0, curr),
    last_submission_date: today,
  };
}

module.exports = { effectiveStreak, nextStreak };
