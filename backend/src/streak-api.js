import { readJson, send } from './http.js';
import { localDay } from './streak-logic.js';
import { preferredExchanges, StreakError } from './streak-store.js';

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const numericId = /^[1-9][0-9]{0,17}$/;

export function createStreakApi(pool, authenticate, store, { remindersAvailable = false } = {}) {
  const endpoint = (action, json = false) => async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    try {
      const body = json ? await readJson(request, 4096) : {};
      if (json && (body.error || !body.data || typeof body.data !== 'object' || Array.isArray(body.data))) {
        throw new StreakError(body.error ?? 400, 'Enter valid details.');
      }
      send(response, 200, await action(claims, body.data ?? {}, new URL(request.url, 'http://localhost').searchParams));
    } catch (error) {
      if (error instanceof StreakError) return send(response, error.status, { error: error.message });
      console.error('Streak request failed (' + (error.code ?? 'unknown') + ').');
      send(response, 503, { error: 'The streak is temporarily unavailable.' });
    }
  };
  const { recomputeStreak } = store;
  const mutate = async (uid, action) => (await recomputeStreak(uid, action)).streak;
  const requiredId = (value) => {
    if (typeof value !== 'string' || !numericId.test(value)) throw new StreakError(400, 'Choose a valid entry.');
    return value;
  };

  async function friendStatus(uid, id, accept) {
    const { rowCount } = await pool.query(`
      UPDATE streak_friends SET status=$3 WHERE id=$2 AND (
        ($3='active' AND friend_user_id=$1 AND status='pending') OR
        ($3='ended' AND $1 IN (user_id,friend_user_id) AND status<>'ended')
      )
    `, [uid, requiredId(id), accept ? 'active' : 'ended']);
    if (!rowCount) throw new StreakError(404, 'This invitation or friendship is unavailable.');
    return { ok: true };
  }

  return {
    status: endpoint(async ({ uid }) => (await recomputeStreak(uid)).streak),
    rest: endpoint(({ uid }, { note }) => {
      if (note !== undefined && (typeof note !== 'string' || note.length > 1000)) {
        throw new StreakError(400, 'Keep the rest-day note under 1,000 characters.');
      }
      return mutate(uid, (db, profile, now) => db.query(`
        INSERT INTO journal_entries (user_id, date, note, is_rest_day) VALUES ($1,$2,$3,true)
        ON CONFLICT (user_id,date) WHERE is_rest_day DO UPDATE SET note=CASE
          WHEN $3='' THEN journal_entries.note ELSE excluded.note END
      `, [uid, localDay(now, profile.timezone), note?.trim() ?? '']));
    }, true),
    review: endpoint(({ uid }, { tradeId }) => mutate(uid, async (db, profile, now) => {
      const { rowCount } = await db.query(`
        UPDATE trades SET reviewed_at=coalesce(reviewed_at,$3) WHERE user_id=$1 AND id=$2
      `, [uid, requiredId(tradeId), now]);
      if (!rowCount) throw new StreakError(404, 'Trade unavailable.');
    }), true),
    remove: endpoint(({ uid }, body, query) => mutate(uid, async (db) => {
      const { rowCount } = await db.query('DELETE FROM trades WHERE user_id=$1 AND id=$2', [uid, requiredId(query.get('tradeId'))]);
      if (!rowCount) throw new StreakError(404, 'Trade unavailable.');
    })),
    journal: endpoint(async ({ uid }, body, query) => {
      const before = query.get('before');
      if (before !== null) requiredId(before);
      const { rows } = await pool.query(`
        SELECT id::text, symbol, market, side, setup, opened_at AS "openedAt", reviewed_at IS NOT NULL AS reviewed
        FROM trades WHERE user_id=$1 AND ($2::bigint IS NULL OR id < $2) ORDER BY id DESC LIMIT 21
      `, [uid, before]);
      const { rows: restDays } = before ? { rows: [] } : await pool.query(`
        SELECT date::text AS day, note FROM journal_entries
        WHERE user_id=$1 AND is_rest_day ORDER BY date DESC LIMIT 20
      `, [uid]);
      return { trades: rows.slice(0, 20), next: rows.length === 21 ? rows[19].id : null, restDays };
    }),
    friends: endpoint(async ({ uid }) => {
      const { rows } = await pool.query(`
        SELECT f.id::text, f.status, f.user_id=$1 AS outgoing, p.display_name AS name,
          CASE WHEN f.status='active' THEN coalesce(s.current,0) END AS current
        FROM streak_friends f JOIN user_profile p ON p.user_id=CASE WHEN f.user_id=$1 THEN f.friend_user_id ELSE f.user_id END
        LEFT JOIN streak_state s ON s.user_id=p.user_id
        WHERE $1 IN (f.user_id,f.friend_user_id) AND f.status<>'ended' ORDER BY f.id DESC
      `, [uid]);
      return { friends: rows };
    }),
    invite: endpoint(async ({ uid }, { code }) => {
      if (typeof code !== 'string' || !uuid.test(code.trim())) throw new StreakError(400, 'Enter a valid friend code.');
      const { rowCount } = await pool.query(`
        INSERT INTO streak_friends (user_id, friend_user_id, status)
        SELECT a.user_id, b.user_id, 'pending' FROM user_profile a CROSS JOIN user_profile b
        WHERE a.user_id=$1 AND b.streak_invite_code=$2 AND a.user_id<>b.user_id
          AND a.onboarded_at IS NOT NULL AND b.onboarded_at IS NOT NULL
        ON CONFLICT DO NOTHING
      `, [uid, code.trim()]);
      if (!rowCount) throw new StreakError(409, 'Friend not found, already invited, or already connected.');
      return { ok: true };
    }, true),
    accept: endpoint(({ uid }, { id }) => friendStatus(uid, id, true), true),
    end: endpoint(({ uid }, { id }) => friendStatus(uid, id, false), true),
    battles: endpoint(async ({ uid }) => ({ battles: await store.listBattles(uid) })),
    challenge: endpoint(async ({ uid }, { friendId, lengthDays }) => {
      if (![3, 7, 14].includes(lengthDays)) throw new StreakError(400, 'Choose a 3, 7, or 14 day battle.');
      const { rowCount } = await pool.query(`
        WITH friends AS (
          SELECT CASE WHEN user_id=$1 THEN friend_user_id ELSE user_id END AS opponent
          FROM streak_friends WHERE id=$2 AND $1 IN (user_id,friend_user_id) AND status='active' FOR UPDATE
        )
        INSERT INTO streak_battles (challenger_id,opponent_id,length_days,started_on,status)
        SELECT $1, friends.opponent, $3, (now() AT TIME ZONE p.timezone)::date, 'active'
        FROM friends CROSS JOIN user_profile p WHERE p.user_id=$1 ON CONFLICT DO NOTHING
      `, [uid, requiredId(friendId), lengthDays]);
      if (!rowCount) throw new StreakError(409, 'Choose an active friend with no ongoing battle.');
      return { ok: true };
    }, true),
    badgesSeen: endpoint(async ({ uid }, { key }) => {
      if (typeof key !== 'string' || key.length > 40) throw new StreakError(400, 'Badge unavailable.');
      await pool.query('UPDATE badges_earned SET seen_at=coalesce(seen_at,now()) WHERE user_id=$1 AND badge_key=$2', [uid, key]);
      return { ok: true };
    }, true),
    preferences: endpoint(async ({ uid }) => {
      const { rows: [row] } = await pool.query(`
        SELECT timezone, markets, streak_exchanges AS exchanges, to_char(streak_reminder_time,'HH24:MI') AS "reminderTime"
        FROM user_profile WHERE user_id=$1 AND onboarded_at IS NOT NULL
      `, [uid]);
      if (!row) throw new StreakError(409, 'Finish onboarding first.');
      return { timezone: row.timezone, exchanges: preferredExchanges(row), reminderTime: row.reminderTime, remindersAvailable };
    }),
    savePreferences: endpoint(({ uid, email }, { timezone, exchanges, reminderTime }) => {
      if (typeof timezone !== 'string' || timezone.length > 80 || !Array.isArray(exchanges) ||
        exchanges.length > 2 || exchanges.some((name) => !['NSE', 'BSE'].includes(name)) ||
        !(reminderTime === null || (typeof reminderTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)))) {
        throw new StreakError(400, 'Check your timezone, exchanges, and reminder time.');
      }
      if (reminderTime && (!remindersAvailable || !email)) throw new StreakError(409, 'Email reminders are unavailable.');
      return mutate(uid, async (db, profile) => {
        const { rowCount } = await db.query('SELECT 1 FROM pg_timezone_names WHERE name=$1', [timezone]);
        try { localDay(new Date(), timezone); }
        catch { throw new StreakError(400, 'Choose a valid IANA timezone.'); }
        if (!rowCount || (timezone !== 'UTC' && !timezone.includes('/'))) throw new StreakError(400, 'Choose a valid IANA timezone.');
        profile.timezone = timezone;
        profile.exchanges = [...new Set(exchanges)];
        await db.query(`
          UPDATE user_profile SET timezone=$2, streak_exchanges=$3, streak_reminder_time=$4, streak_reminder_email=$5 WHERE user_id=$1
        `, [uid, timezone, profile.exchanges, reminderTime, reminderTime ? email : null]);
      });
    }, true),
  };
}
