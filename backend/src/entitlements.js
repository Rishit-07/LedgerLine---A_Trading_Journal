// The single place that answers "what plan does this account have right now?".
// Mentor and billing code call this; they never read provider tables directly.
// Billing may change how the answer is computed, but not this shape.
export const PLAN_RANK = { free: 0, pro: 1, mentor: 2 };

export async function activePlan(pool, userId, now = new Date()) {
  const { rows: [row] } = await pool.query(
    `SELECT
       (SELECT true FROM mentor_entitlements WHERE user_id=$1 AND active AND (expires_at IS NULL OR expires_at>$2)) AS mentor,
       (SELECT max(valid_until) FROM report_subscriptions WHERE user_id=$1 AND valid_until>$2) AS pro_until`,
    [userId, now]);
  const plan = row?.mentor ? 'mentor' : row?.pro_until ? 'pro' : 'free';
  return { plan, validUntil: row?.pro_until ?? null };
}

/** True when the account's plan is at least `needed` ('pro' or 'mentor'). A mentor plan includes Pro. */
export async function hasPlan(pool, userId, needed, now) {
  return PLAN_RANK[(await activePlan(pool, userId, now)).plan] >= PLAN_RANK[needed];
}
