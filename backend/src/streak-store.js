import { calculateStreak, localDay, scoreBattle, shiftDay } from './streak-logic.js';

const milestoneDays = [7, 14, 30, 60, 100];
export const badgeTitles = Object.fromEntries([
  ...milestoneDays.map((days) => ['streak-' + days, days + '-day streak']),
  ['process-cup', 'Process Cup'],
  ['streak-7','First week'],
  ['nine-clean-days','Nine clean days'],
]);

export class StreakError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function preferredExchanges(profile) {
  return profile.exchanges ?? (profile.markets.some((market) => ['forex', 'crypto'].includes(market)) ? [] : ['NSE', 'BSE']);
}

function isMarketClosed({ timezone, exchanges, holidays }) {
  const exceptions = new Map(holidays.map((row) => [row.exchange + row.day, row]));
  return (day) => exchanges.length > 0 && ![-1, 0, 1].some((offset) => {
    const exchangeDay = shiftDay(day, offset);
    const weekday = new Date(exchangeDay).getUTCDay();
    return exchanges.some((exchange) => {
      const session = exceptions.get(exchange + exchangeDay);
      if (session?.closed ?? (weekday === 0 || weekday === 6)) return false;
      // One exchange session can span two local dates outside India.
      return localDay(exchangeDay + 'T' + (session?.opensAt ?? '09:15:00') + '+05:30', timezone) <= day &&
        localDay(exchangeDay + 'T' + (session?.closesAt ?? '15:30:00') + '+05:30', timezone) >= day;
    });
  });
}

export function createStreakStore(pool, clock = () => new Date()) {
  async function recomputeStreak(userId, mutate) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const { rows: [profile] } = await db.query(`
        SELECT timezone, markets, streak_exchanges AS exchanges, streak_invite_code AS "inviteCode"
        FROM user_profile WHERE user_id = $1 AND onboarded_at IS NOT NULL FOR UPDATE
      `, [userId]);
      if (!profile) throw new StreakError(409, 'Finish onboarding before using the streak.');
      const now = clock();
      const result = await mutate?.(db, profile, now);
      const today = localDay(now, profile.timezone);
      const exchanges = preferredExchanges(profile);
      const { rows: activity } = await db.query(`
        WITH trade_activity AS (
          SELECT (t.opened_at AT TIME ZONE $2)::date AS day, rules.checks, rules.kept
          FROM trades t CROSS JOIN LATERAL (
            SELECT count(*) AS checks, count(*) FILTER (WHERE c.kept) AS kept
            FROM trade_checks c WHERE c.user_id = t.user_id AND c.trade_id = t.id
          ) rules WHERE t.user_id = $1
        )
        SELECT day::text, 'trade' AS kind, 0 AS reviews, sum(checks)::int AS checks, sum(kept)::int AS kept
        FROM trade_activity GROUP BY day
        UNION ALL SELECT (reviewed_at AT TIME ZONE $2)::date::text, 'review', count(*)::int, 0, 0
        FROM trades WHERE user_id = $1 AND reviewed_at IS NOT NULL GROUP BY 1
        UNION ALL SELECT date::text, 'rest', 0, 0, 0
        FROM journal_entries WHERE user_id = $1 AND is_rest_day
      `, [userId, profile.timezone]);
      const first = activity.reduce((min, item) => item.day < min ? item.day : min, today);
      const { rows: holidays } = activity.length && exchanges.length ? await db.query(`
        SELECT exchange, day::text, closed, opens_at::text AS "opensAt", closes_at::text AS "closesAt" FROM exchange_holidays
        WHERE exchange = ANY($1) AND day BETWEEN $2::date - 1 AND $3::date + 1
      `, [exchanges, first, today]) : { rows: [] };
      const { days, perfectBest, ...state } = calculateStreak({
        today, activity, isClosed: isMarketClosed({ timezone: profile.timezone, exchanges, holidays }),
      });
      const dates = days.map(({ day }) => day);
      await db.query('DELETE FROM streak_days WHERE user_id = $1 AND NOT (day = ANY($2::date[]))', [userId, dates]);
      await db.query(`
        INSERT INTO streak_days (user_id, day, kind)
        SELECT $1, date, kind FROM unnest($2::date[], $3::text[]) AS counted(date, kind)
        ON CONFLICT (user_id, day) DO UPDATE SET kind = excluded.kind WHERE streak_days.kind <> excluded.kind
      `, [userId, dates, days.map(({ kind }) => kind)]);
      await db.query(`
        INSERT INTO streak_state (user_id, current, best, freezes_available, last_counted_day, level, xp, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (user_id) DO UPDATE SET current=excluded.current, best=excluded.best,
          freezes_available=excluded.freezes_available,last_counted_day=excluded.last_counted_day,
          level=excluded.level,xp=excluded.xp,updated_at=excluded.updated_at
      `, [userId, state.current, state.best, state.freezes, state.lastCountedDay, state.level, state.xp, now]);
      const unlocks = milestoneDays.filter((threshold) => state.best >= threshold).map((threshold) => 'streak-' + threshold);
      if (perfectBest >= 9) unlocks.push('nine-clean-days');
      if (perfectBest >= 30) unlocks.push('process-cup');
      await db.query(`
        INSERT INTO badges_earned (user_id, badge_key)
        SELECT $1, badge FROM unnest($2::text[]) AS available(badge) ON CONFLICT DO NOTHING
      `, [userId, unlocks]);
      const { rows: badges } = await db.query(`
        SELECT badge_key AS key, earned_at AS "earnedAt", seen_at IS NOT NULL AS seen
        FROM badges_earned WHERE user_id = $1 ORDER BY earned_at, badge_key
      `, [userId]);
      await db.query('COMMIT');
      return {
        result, dates,
        streak: { ...state, perfectBest, today, timezone: profile.timezone, inviteCode: profile.inviteCode,
          badges: badges.map((badge) => ({ ...badge, title: badgeTitles[badge.key] ?? badge.key })) },
      };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async function settleBattle(battle) {
    const end = shiftDay(battle.startedOn, battle.lengthDays - 1);
    const now = clock();
    if (localDay(now, battle.challengerTimezone) <= shiftDay(end, 2) ||
        localDay(now, battle.opponentTimezone) <= shiftDay(end, 2)) return battle;
    const challenger = await recomputeStreak(battle.challenger);
    const opponent = await recomputeStreak(battle.opponent);
    const a = scoreBattle(challenger.dates, battle.startedOn, battle.lengthDays);
    const b = scoreBattle(opponent.dates, battle.startedOn, battle.lengthDays);
    const winner = a === b ? null : a > b ? battle.challenger : battle.opponent;
    const { rows: [finished] } = await pool.query(`
      UPDATE streak_battles SET status='completed', winner_id=$2
      WHERE id=$1 AND status='active' RETURNING status, winner_id AS winner
    `, [battle.id, winner]);
    return finished ? { ...battle, ...finished } : battle;
  }

  async function listBattles(userId) {
    const { rows } = await pool.query(`
      SELECT b.id::text, b.challenger_id AS challenger, b.opponent_id AS opponent,
        b.started_on::text AS "startedOn", b.length_days AS "lengthDays", b.status, b.winner_id AS winner,
        a.timezone AS "challengerTimezone", o.timezone AS "opponentTimezone",
        CASE WHEN b.challenger_id=$1 THEN o.display_name ELSE a.display_name END AS name
      FROM streak_battles b JOIN user_profile a ON a.user_id=b.challenger_id
      JOIN user_profile o ON o.user_id=b.opponent_id
      WHERE $1 IN (b.challenger_id,b.opponent_id) ORDER BY b.id DESC LIMIT 50
    `, [userId]);
    const battles = [];
    for (const record of rows) {
      const battle = record.status === 'active' ? await settleBattle(record) : record;
      battles.push({ id: battle.id, name: battle.name, startedOn: battle.startedOn, lengthDays: battle.lengthDays,
        status: battle.status, result: battle.status !== 'completed' ? null : !battle.winner ? 'tie' : battle.winner === userId ? 'won' : 'lost' });
    }
    return battles;
  }

  return { recomputeStreak, listBattles };
}
