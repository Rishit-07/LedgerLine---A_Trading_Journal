/* One place that counts monthly tool use. The workspace API enforces it and the billing overview shows it, so they can never disagree. */
import { FEATURE_LIMITS, FEATURE_NAMES, FREE_MT_IMPORTS_PER_MONTH, AI_TOKENS } from './billing-config.js';

export const usedSql = {
  replay: 'SELECT count(*)::int AS n FROM billing_replay_usage WHERE user_id=$1 AND used_at>=$2',
  mistake: 'SELECT count(*)::int AS n FROM mistakes WHERE user_id=$1 AND created_at>=$2',
  coach: 'SELECT count(*)::int AS n FROM coach_requests WHERE user_id=$1 AND created_at>=$2',
  replay_review: "SELECT count(*)::int AS n FROM ai_tool_runs WHERE user_id=$1 AND tool='replay_review' AND created_at>=$2",
  mistake_insight: "SELECT count(*)::int AS n FROM ai_tool_runs WHERE user_id=$1 AND tool='mistake_insight' AND created_at>=$2",
};
export const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export const limitFor = (plan, feature) => FEATURE_LIMITS[feature][plan];

/** Every tool's use this month for the billing page. */
export async function toolUsage(db, uid, plan) {
  const since = monthStart();
  const tools = [];
  for (const key of Object.keys(FEATURE_LIMITS)) tools.push({ key, name: FEATURE_NAMES[key], used: (await db.query(usedSql[key], [uid, since])).rows[0].n, limit: limitFor(plan, key) });
  const t = await tokenState(db, uid, plan);
  tools.push({ key: 'ai_tokens', name: t.window === 'day' ? 'AI tokens today (refill at midnight IST)' : 'AI tokens this month', used: t.window === 'hour' ? t.month.used : t.used, limit: t.window === 'hour' ? t.month.limit : t.limit });
  if (t.hour) tools.push({ key: 'ai_hour', name: 'AI tokens this hour (cooldown)', used: t.hour.used, limit: t.hour.limit });
  const mt = (await db.query('SELECT count(*)::int AS n FROM mt_imported WHERE user_id=$1 AND imported_at>=$2', [uid, since])).rows[0].n;
  tools.push({ key: 'mt_import', name: 'MetaTrader import', used: mt, limit: plan === 'free' ? FREE_MT_IMPORTS_PER_MONTH : null });
  return tools;
}
export const limitTable = () => ({ ...FEATURE_LIMITS, mt_import: { free: FREE_MT_IMPORTS_PER_MONTH, paid: null }, ai_tokens: AI_TOKENS });
export const IST_DAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date";
export const WALLET_OFF = 1_000_000_000;   // the daily wallet only limits Free; paid plans use the ledger windows below
export const walletAllowance = (plan) => (plan === 'free' ? AI_TOKENS.free.day : WALLET_OFF);
export async function tokensSpent(db, uid) {
  return (await db.query(`SELECT spent FROM coach_daily_tokens WHERE user_id=$1 AND day=${IST_DAY}`, [uid])).rows[0]?.spent ?? 0;
}
export const recordTokens = (db, uid, tokens) => (tokens > 0 ? db.query('INSERT INTO ai_token_ledger(user_id,tokens) VALUES($1,$2)', [uid, Math.min(tokens, 1_000_000)]) : null);

/** What is left in the AI wallet right now, and why it might be empty. Free: the daily wallet. Pro and Mentor: a month, plus a rolling-hour cooldown. */
export async function tokenState(db, uid, plan, now = new Date()) {
  const cfg = AI_TOKENS[plan];
  if (cfg.day) { const used = await tokensSpent(db, uid); return { plan, window: 'day', limit: cfg.day, used, remaining: Math.max(0, cfg.day - used), allowance: cfg.day }; }
  const hourAgo = new Date(now.getTime() - 3600_000);
  const { rows: [r] } = await db.query(
    `SELECT coalesce(sum(tokens) FILTER (WHERE created_at>=$2),0)::int AS month, coalesce(sum(tokens) FILTER (WHERE created_at>=$3),0)::int AS hour,
            min(created_at) FILTER (WHERE created_at>=$3) AS oldest FROM ai_token_ledger WHERE user_id=$1 AND created_at>=$2`, [uid, monthStart(now), hourAgo]);
  const monthLeft = Math.max(0, cfg.month - r.month), hourLeft = Math.max(0, cfg.hour - r.hour);
  const remaining = Math.min(monthLeft, hourLeft);
  const window = monthLeft <= hourLeft ? 'month' : 'hour';
  const retryMinutes = window === 'hour' && r.oldest ? Math.max(1, Math.ceil((new Date(r.oldest).getTime() + 3600_000 - now.getTime()) / 60_000)) : null;
  return { plan, window, limit: window === 'month' ? cfg.month : cfg.hour, used: window === 'month' ? r.month : r.hour, remaining, allowance: window === 'month' ? cfg.month : cfg.hour, retryMinutes,
    month: { used: r.month, limit: cfg.month }, hour: { used: r.hour, limit: cfg.hour } };
}
export function emptyMessage(t) {
  if (t.window === 'day') return 'Your AI tokens refill at midnight IST.';
  if (t.window === 'hour') return `You have used this hour's AI allowance. Try again in about ${t.retryMinutes ?? 60} minutes.`;
  return 'You have used this month\'s AI tokens. They reset on the 1st.';
}
