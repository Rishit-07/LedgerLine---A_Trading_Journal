import { readJson, send } from './http.js';

const markets = new Set(['stocks', 'options', 'futures', 'forex', 'crypto']);
const brokers = new Set(['manual', 'csv', 'zerodha', 'upstox', 'angel-one', 'dhan', 'fyers']);
const ruleKeys = ['risk', 'loss', 'trades'];

const readProfile = (db, uid) => db.query(`
  SELECT display_name AS "displayName", markets, risk_per_trade_pct::float AS risk,
    daily_loss_limit_r AS loss, max_trades_per_day AS trades, broker,
    onboarding_step AS step, onboarded_at AS "completedAt",
    ARRAY(SELECT rule_key FROM rules WHERE user_id = $1 AND hard AND active) AS "hardRules"
  FROM user_profile WHERE user_id = $1
`, [uid]);

function validStep(payload) {
  if (payload?.step === 1) {
    return typeof payload.displayName === 'string' && payload.displayName.trim().length >= 1 && payload.displayName.trim().length <= 100;
  }
  if (payload?.step === 2) {
    return Array.isArray(payload.markets) && payload.markets.length > 0 &&
      new Set(payload.markets).size === payload.markets.length && payload.markets.every((market) => markets.has(market));
  }
  if (payload?.step === 3) {
    return [0.25, 0.5, 1, 1.5, 2].includes(payload.risk) && [1, 2, 3, 4].includes(payload.loss) &&
      [2, 3, 5, 8, 10].includes(payload.trades) && brokers.has(payload.broker) &&
      Array.isArray(payload.hardRules) && new Set(payload.hardRules).size === payload.hardRules.length &&
      payload.hardRules.every((key) => ruleKeys.includes(key));
  }
  return payload?.step === 4;
}

async function saveStep(db, uid, input) {
  if (input.step === 1) {
    await db.query(`INSERT INTO user_profile (user_id, display_name, onboarding_step) VALUES ($1, $2, 2)
      ON CONFLICT (user_id) DO UPDATE SET display_name = excluded.display_name,
        onboarding_step = greatest(user_profile.onboarding_step, 2)`, [uid, input.displayName.trim()]);
  } else if (input.step === 2) {
    await db.query(`UPDATE user_profile SET markets = $2, onboarding_step = greatest(onboarding_step, 3) WHERE user_id = $1`, [uid, input.markets]);
  } else if (input.step === 3) {
    await db.query(`UPDATE user_profile SET risk_per_trade_pct = $2, daily_loss_limit_r = $3,
      max_trades_per_day = $4, broker = $5, onboarding_step = 4 WHERE user_id = $1`, [uid, input.risk, input.loss, input.trades, input.broker]);
    const texts = [`Risk no more than ${input.risk}% per trade`, `Stop at a daily loss of ${input.loss}R`, `Take at most ${input.trades} trades per day`];
    await db.query(`INSERT INTO rules (user_id, rule_key, text, hard, position)
      SELECT $1, key, label, key = ANY($4::text[]), position FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS entry(key, label, position)
      ON CONFLICT (user_id, rule_key) DO UPDATE SET text = excluded.text, hard = excluded.hard`, [uid, ruleKeys, texts, input.hardRules]);
    await db.query(`INSERT INTO broker_links (user_id, broker) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET broker = excluded.broker, status = 'not_connected', linked_at = NULL
      WHERE broker_links.broker <> excluded.broker`, [uid, input.broker]);
  } else {
    await db.query('UPDATE user_profile SET onboarded_at = now() WHERE user_id = $1', [uid]);
  }
}

export function createOnboardingHandler(pool, authenticate) {
  return async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    const { uid } = claims;
    let db;
    try {
      if (request.method === 'GET') {
        const { rows: [profile] } = await readProfile(pool, uid);
        send(response, 200, profile ?? { step: 1, displayName: claims.name ?? '' });
        return;
      }
      const { data, error } = await readJson(request, 4096);
      if (error || !validStep(data)) {
        send(response, error ?? 400, { error: 'Check your answers and try again.' });
        return;
      }
      db = await pool.connect();
      await db.query('BEGIN');
      const { rowCount } = await db.query('SELECT firebase_uid FROM ledgerline_accounts WHERE firebase_uid = $1 FOR UPDATE', [uid]);
      const { rows: [previous] } = await readProfile(db, uid);
      if (!rowCount || data.step > (previous?.step ?? 1)) {
        await db.query('ROLLBACK');
        send(response, 409, { error: 'Finish the earlier steps first.' });
        return;
      }
      if (!previous?.completedAt) await saveStep(db, uid, data);
      const { rows: [profile] } = await readProfile(db, uid);
      await db.query('COMMIT');
      send(response, 200, profile);
    } catch (error) {
      if (db) await db.query('ROLLBACK').catch(() => {});
      console.error('Could not save or load onboarding (' + (error.code ?? 'unknown error') + ').');
      send(response, 503, { error: 'Your onboarding progress is temporarily unavailable.' });
    } finally {
      db?.release();
    }
  };
}
