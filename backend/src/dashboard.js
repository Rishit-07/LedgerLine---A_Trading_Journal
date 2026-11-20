import { readJson, send } from './http.js';
import { normalizeTradeTime } from './streak-logic.js';
import { StreakError } from './streak-store.js';

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

function metrics({ day, trades }) {
  const closed = trades.filter((trade) => trade.result !== null);
  const month = closed.filter((trade) => trade.closedDay.startsWith(day.slice(0, 7)));
  const recent = closed.filter((trade) => trade.closedDay >= earlier(day, 6));
  const monthlyBooked = month.length ? total(month) : null;
  const checkCount = recent.reduce((sum, trade) => sum + trade.checks, 0);
  const keptCount = recent.reduce((sum, trade) => sum + trade.kept, 0);
  const today = trades.filter((trade) => trade.openedDay === day || trade.closedDay === day);
  const tradeActivity = (trade) => trade.closedAt ?? trade.openedAt;
  const windowStart = earlier(day, 41);
  const recentTrades = trades
    .filter((trade) => (trade.closedDay ?? trade.openedDay) >= windowStart)
    .sort((a, b) => tradeActivity(b).localeCompare(tradeActivity(a)));
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
  for (const trade of closed) {
    const group = daily.get(trade.closedDay) ?? [];
    group.push(trade);
    daily.set(trade.closedDay, group);
  }
  const monday = earlier(day, (new Date(day).getUTCDay() + 6) % 7);
  const periods = [
    ['This week', closed.filter((trade) => trade.closedDay >= monday && trade.closedDay <= day)],
    ['This month', month],
  ].map(([label, trades]) => ({
    label, result: trades.length ? total(trades) : null, count: trades.length,
    winRate: percent(trades.filter((trade) => trade.result > 0).length, trades.length),
    adherence: percent(trades.reduce((sum, trade) => sum + trade.kept, 0), trades.reduce((sum, trade) => sum + trade.checks, 0)),
  }));
  return {
    monthlyBooked, winRate: percent(recent.filter((trade) => trade.result > 0).length, recent.length),
    average: recent.length ? total(recent) / recent.length : null,
    rulesFollowed: percent(keptCount, checkCount), today, recentTrades,
    open: trades.filter((trade) => trade.result === null), dailyLoss: dailyNet < 0 ? -dailyNet : 0,
    curve, peak, drawdown, periods,
    days: days.map((date) => {
      const trades = daily.get(date) ?? [];
      return { date, result: trades.length ? total(trades) : null, count: trades.length };
    }),
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
        SELECT today.day::text AS day, p.display_name AS "displayName", p.markets, p.timezone AS "streakTimezone",
          p.risk_per_trade_pct::float AS "riskPerTrade", p.daily_loss_limit_r AS "dailyLossLimit",
          p.max_trades_per_day AS "maxTrades", p.broker,
          (SELECT json_build_object('bias', bias, 'locked', locked_at IS NOT NULL)
           FROM plans WHERE user_id = $1 AND date = today.day) AS plan,
          coalesce((SELECT json_agg(json_build_object('id', id::text, 'text', text, 'hard', hard) ORDER BY position)
           FROM rules WHERE user_id = $1 AND active), '[]') AS rules,
          coalesce(s.current,0) AS streak,
          coalesce((SELECT json_agg(visible_trades ORDER BY "openedAt" DESC, id DESC) FROM visible_trades), '[]') AS trades
        FROM user_profile p CROSS JOIN today LEFT JOIN streak_state s ON s.user_id=p.user_id
        WHERE p.user_id = $1 AND p.onboarded_at IS NOT NULL
      `, [claims.uid]);
      if (!data) return send(response, 409, { error: 'Finish onboarding to open Dashboard.' });
      const { trades, ...profile } = data;
      send(response, 200, { ...profile, ...metrics({ day: data.day, trades }) });
    } catch (error) {
      console.error('Could not load the dashboard (' + (error.code ?? 'unknown error') + ').');
      send(response, 503, { error: 'Dashboard is temporarily unavailable.' });
    }
  };
}

export function createTradeHandler(streaks, authenticate) {
  return async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    const { data, error } = await readJson(request, 4096);
    const symbol = typeof data?.symbol === 'string' ? data.symbol.trim().toUpperCase() : '';
    const setup = typeof data?.setup === 'string' ? data.setup.trim() : '';
    const mood = data?.mood ?? null;
    const validPrice = (value) => value === null || (Number.isFinite(value) && value >= 0.00000001 && value < 1e12);
    if (error || !/^[A-Z0-9][A-Z0-9 .:/_-]{0,47}$/.test(symbol) || setup.length > 100 ||
      (mood !== null && !['Calm', 'Rushed', 'Fearful', 'Confident'].includes(mood)) ||
      !['long', 'short'].includes(data?.side) || !['stocks', 'options', 'futures', 'forex', 'crypto'].includes(data?.market) ||
      !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(data?.requestId ?? '') ||
      !validPrice(data.stop) || !validPrice(data.target) ||
      !(data.result === null || (Number.isFinite(data.result) && Math.abs(data.result) <= 10000)) ||
      !Array.isArray(data.kept) || data.kept.some((id) => typeof id !== 'string' || !/^\d{1,18}$/.test(id))) {
      return send(response, error ?? 400, { error: 'Check the trade details and try again.' });
    }
    try {
      const { result: openedAt, streak } = await streaks.recomputeStreak(claims.uid, async (db, profile, now) => {
        const { rows: [existing] } = await db.query(
          'SELECT opened_at AS "openedAt" FROM trades WHERE user_id=$1 AND client_request_id=$2',
          [claims.uid, data.requestId],
        );
        if (existing) return existing.openedAt;
        let occurredAt;
        try { occurredAt = normalizeTradeTime(data.occurredAt, now); }
        catch (error) { throw new StreakError(400, error.message); }
        const { rows: [row] } = await db.query(`
          WITH saved AS (
            INSERT INTO trades (user_id, symbol, market, side, r_multiple, stop, target, setup, opened_at, closed_at, client_request_id)
            VALUES ($1,$2,$3,$4,$5::numeric,$6,$7,$8,$12::timestamptz,
              CASE WHEN $5::numeric IS NOT NULL THEN $12::timestamptz END,$9)
            RETURNING id, opened_at
          ), checks AS (
            INSERT INTO trade_checks (user_id, trade_id, rule_id, kept)
            SELECT $1, saved.id, rules.id, rules.id::text = ANY($10::text[])
            FROM saved CROSS JOIN rules WHERE rules.user_id = $1 AND rules.active
          ), feeling AS (
            INSERT INTO journal_entries (user_id, trade_id, date, note, mood)
            SELECT $1, id, (opened_at AT TIME ZONE 'Asia/Kolkata')::date, '', $11::text
            FROM saved WHERE $11::text IS NOT NULL
          )
          SELECT opened_at AS "openedAt" FROM saved
        `, [claims.uid, symbol, data.market, data.side, data.result, data.stop, data.target, setup || null, data.requestId, data.kept, mood, occurredAt]);
        return row.openedAt;
      });
      send(response, 200, { saved: true, openedAt, streak });
    } catch (error) {
      if (error instanceof StreakError) return send(response, error.status, { error: error.message });
      console.error('Could not save the trade (' + (error.code ?? 'unknown error') + ').');
      send(response, 503, { error: 'Your trade could not be saved. Try again.' });
    }
  };
}
