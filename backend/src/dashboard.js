import { readJson, send } from './http.js';

const dayMs = 86_400_000;
const earlier = (day, days) => new Date(Date.parse(day) - days * dayMs).toISOString().slice(0, 10);
const total = (trades) => trades.reduce((sum, trade) => sum + trade.result, 0);
const percent = (a, b) => b ? Math.round(100 * a / b) : null;
const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' });
const hour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' });

function groupPerformance(trades, label) {
  const groups = new Map();
  for (const trade of trades) {
    const key = label(trade);
    const group = groups.get(key) ?? { label: key, net: 0, count: 0 };
    group.count++;
    group.net += trade.result;
    groups.set(key, group);
  }
  return [...groups.values()].map(({ label, net, count }) => ({ label, average: net / count, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function metrics({ day, trades, activityDays }) {
  const closed = trades.filter((trade) => trade.result !== null);
  const month = closed.filter((trade) => trade.closedDay.startsWith(day.slice(0, 7)));
  const recent = closed.filter((trade) => trade.closedDay >= earlier(day, 6));
  const monthlyBooked = month.length ? total(month) : null;
  const checkCount = recent.reduce((sum, trade) => sum + trade.checks, 0);
  const keptCount = recent.reduce((sum, trade) => sum + trade.kept, 0);
  const activeDays = new Set(activityDays);
  let streak = 0;
  for (let offset = activeDays.has(day) ? 0 : 1; activeDays.has(earlier(day, offset)); offset++) streak++;
  const today = trades.filter((trade) => trade.openedDay === day || trade.closedDay === day);
  const tradeActivity = (trade) => trade.closedAt ?? trade.openedAt;
  const windowStart = earlier(day, 41);
  const recentTrades = trades
    .filter((trade) => (trade.closedDay ?? trade.openedDay) >= windowStart)
    .sort((a, b) => tradeActivity(b).localeCompare(tradeActivity(a)))
    .slice(0, 5);
  const dailyNet = total(closed.filter((trade) => trade.closedDay === day));
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  const curve = [...closed].sort((a, b) => a.closedAt.localeCompare(b.closedAt)).map((trade) => {
    equity += trade.result;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, equity - peak);
    return { date: trade.closedDay, equity };
  });
  const days = Array.from({ length: 35 }, (_, index) => earlier(day, 34 - index));
  const daily = new Map();
  for (const trade of closed) daily.set(trade.closedDay, (daily.get(trade.closedDay) ?? 0) + trade.result);
  return {
    monthlyBooked, winRate: percent(recent.filter((trade) => trade.result > 0).length, recent.length),
    average: recent.length ? total(recent) / recent.length : null,
    rulesFollowed: percent(keptCount, checkCount), streak, today, recentTrades,
    open: trades.filter((trade) => trade.result === null), dailyLoss: dailyNet < 0 ? -dailyNet : 0,
    curve, peak, drawdown, days: days.map((date) => ({ date, result: daily.get(date) ?? null })),
    breakdown: {
      setup: groupPerformance(closed, (trade) => trade.setup || 'No setup recorded'),
      weekday: groupPerformance(closed, (trade) => weekday.format(new Date(trade.closedAt))),
      hour: groupPerformance(closed, (trade) => `${hour.format(new Date(trade.closedAt))}:00 IST`),
    },
  };
}

export function createDashboardHandler(pool, authenticate) {
  return async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    try {
      const { rows: [data] } = await pool.query(`
        WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS day),
        visible_trades AS (
          SELECT t.id::text, t.symbol, t.market, t.side, t.stop::float, t.target::float, t.setup,
            t.r_multiple::float AS result, t.opened_at AS "openedAt", t.closed_at AS "closedAt",
            (t.opened_at AT TIME ZONE 'Asia/Kolkata')::date AS "openedDay",
            (t.closed_at AT TIME ZONE 'Asia/Kolkata')::date AS "closedDay",
            (SELECT count(*)::int FROM trade_checks c WHERE c.user_id = $1 AND c.trade_id = t.id) AS checks,
            (SELECT count(*)::int FROM trade_checks c WHERE c.user_id = $1 AND c.trade_id = t.id AND c.kept) AS kept
          FROM trades t CROSS JOIN today
          WHERE t.user_id = $1 AND (t.closed_at IS NULL OR t.opened_at >= (today.day - 41)::timestamp AT TIME ZONE 'Asia/Kolkata'
            OR t.closed_at >= (today.day - 41)::timestamp AT TIME ZONE 'Asia/Kolkata')
          ORDER BY t.opened_at DESC
        )
        SELECT today.day::text AS day, p.display_name AS "displayName", p.markets,
          p.risk_per_trade_pct::float AS "riskPerTrade", p.daily_loss_limit_r AS "dailyLossLimit",
          p.max_trades_per_day AS "maxTrades", p.broker,
          (SELECT json_build_object('bias', bias, 'locked', locked_at IS NOT NULL)
           FROM plans WHERE user_id = $1 AND date = today.day) AS plan,
          coalesce((SELECT json_agg(json_build_object('id', id::text, 'text', text, 'hard', hard) ORDER BY position)
           FROM rules WHERE user_id = $1 AND active), '[]') AS rules,
          coalesce((SELECT json_agg(date::text) FROM (
            SELECT date FROM journal_entries WHERE user_id = $1
            UNION SELECT (opened_at AT TIME ZONE 'Asia/Kolkata')::date FROM trades WHERE user_id = $1
          ) AS days), '[]') AS "activityDays",
          coalesce((SELECT json_agg(visible_trades ORDER BY "openedAt" DESC, id DESC) FROM visible_trades), '[]') AS trades
        FROM user_profile p CROSS JOIN today WHERE p.user_id = $1 AND p.onboarded_at IS NOT NULL
      `, [claims.uid]);
      if (!data) return send(response, 409, { error: 'Finish onboarding to open Dashboard.' });
      const { trades, activityDays, ...profile } = data;
      send(response, 200, { ...profile, ...metrics({ day: data.day, trades, activityDays }) });
    } catch (error) {
      console.error('Could not load the dashboard (' + (error.code ?? 'unknown error') + ').');
      send(response, 503, { error: 'Dashboard is temporarily unavailable.' });
    }
  };
}

export function createTradeHandler(pool, authenticate) {
  return async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    const { data, error } = await readJson(request, 4096);
    const symbol = typeof data?.symbol === 'string' ? data.symbol.trim().toUpperCase() : '';
    const setup = typeof data?.setup === 'string' ? data.setup.trim() : '';
    const validPrice = (value) => value === null || (Number.isFinite(value) && value >= 0.00000001 && value < 1e12);
    if (error || !/^[A-Z0-9][A-Z0-9 .:/_-]{0,47}$/.test(symbol) || setup.length > 100 ||
      !['long', 'short'].includes(data?.side) || !['stocks', 'options', 'futures', 'forex', 'crypto'].includes(data?.market) ||
      !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(data?.requestId ?? '') ||
      !validPrice(data.stop) || !validPrice(data.target) ||
      !(data.result === null || (Number.isFinite(data.result) && Math.abs(data.result) <= 10000)) ||
      !Array.isArray(data.kept) || data.kept.some((id) => typeof id !== 'string' || !/^\d{1,18}$/.test(id))) {
      return send(response, error ?? 400, { error: 'Check the trade details and try again.' });
    }
    try {
      const { rows: [row] } = await pool.query(`
        WITH saved AS (
          INSERT INTO trades (user_id, symbol, market, side, r_multiple, stop, target, setup, closed_at, client_request_id)
          SELECT $1, $2, $3, $4, $5::numeric, $6, $7, $8, CASE WHEN $5::numeric IS NOT NULL THEN now() END, $9
          FROM user_profile WHERE user_id = $1 AND onboarded_at IS NOT NULL AND $3 = ANY(markets)
          ON CONFLICT (user_id, client_request_id) DO NOTHING RETURNING id
        ), checks AS (
          INSERT INTO trade_checks (user_id, trade_id, rule_id, kept)
          SELECT $1, saved.id, rules.id, rules.id::text = ANY($10::text[])
          FROM saved CROSS JOIN rules WHERE rules.user_id = $1 AND rules.active
        )
        SELECT EXISTS(SELECT 1 FROM saved) AS saved
      `, [claims.uid, symbol, data.market, data.side, data.result, data.stop, data.target, setup || null, data.requestId, data.kept]);
      if (!row.saved) {
        const duplicate = await pool.query('SELECT 1 FROM trades WHERE user_id = $1 AND client_request_id = $2', [claims.uid, data.requestId]);
        if (!duplicate.rowCount) return send(response, 400, { error: 'Choose a market from your onboarding preferences.' });
      }
      send(response, 200, { saved: true });
    } catch (error) {
      console.error('Could not save the trade (' + (error.code ?? 'unknown error') + ').');
      send(response, 503, { error: 'Your trade could not be saved. Try again.' });
    }
  };
}
