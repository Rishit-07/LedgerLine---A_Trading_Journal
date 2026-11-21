const plans = {
  free: {monthly:0, yearly:0, features:["Journal","Streaks","Clubs"], weeklySummaries: 1, monthlyReviews: 0},
  pro: {monthly:149, yearly:1199, features:["Replay","Mistake lab","AI reports","Broker sync","Ask your journal"], monthlyReviews: 30},
  mentor: {monthly:499, yearly:4999, features:["Create spaces","Announcements","Cohort view","Verified badge","All Pro tools"], monthlyReviews: 30}
};
function can(plan, feature) {
  return feature === 'aiReview' && (plan === 'pro' || plan === 'mentor');
}

module.exports = {plans,can};
