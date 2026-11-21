export const plans = {
  free: {weeklySummaries: 1, monthlyReviews: 0},
  pro: {monthlyReviews: 30},
  mentor: {monthlyReviews: 30}
};
export function can(plan, feature) {
  return feature === 'aiReview' && (plan === 'pro' || plan === 'mentor');
}
