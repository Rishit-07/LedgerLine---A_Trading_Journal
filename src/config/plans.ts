const plans = {
  free: {monthly:0, yearly:0, features:["Journal","Streaks","Clubs","Replay, Mistake lab and Ask your journal: 5 uses each a month","MetaTrader report import (25 trades a month)"], weeklySummaries: 1, monthlyReviews: 0},
  pro: {monthly:149, yearly:1199, features:["Replay (150 a month)","Mistake lab (300 tags a month)","Ask your journal (300 questions a month)","AI reports and monthly reviews","MetaTrader live sync and unlimited import"], monthlyReviews: 30},
  mentor: {monthly:499, yearly:4999, features:["Create spaces","Announcements","Cohort view","Verified badge","All Pro tools"], monthlyReviews: 30}
};
function can(plan, feature) {
  return feature === 'aiReview' && (plan === 'pro' || plan === 'mentor');
}

module.exports = {plans,can};
