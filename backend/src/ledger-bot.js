/* Ledger bot: the user's pop setting, and one short process-only note.
   Notes use only the user's own numbers, computed here. They never mention money, tips or predictions. */
import { studentStats } from './mentorship-stats.js';
import { readJson, send } from './http.js';

const BANNED = /profit|loss|p&l|pnl|[$₹€£]|\btips?\b|predict|forecast|\bbuy\b|\bsell\b|\btarget\b|\bwill (rise|fall|go)\b/i;
const FALLBACK = 'Add a trade and write down your plan. Ledger follows the process, not the result.';

/** Pick the note from the account's numbers. Exported so it can be tested without a database. */
export function noteFor(stats) {
  let note;
  const streak = stats?.streak?.current ?? 0;
  if (streak >= 3) note = `${streak} days in a row of journaling. Steady process.`;
  else if (stats?.enough_data && Number.isFinite(stats.rules_followed_pct)) note = `You kept your rules on ${Math.round(stats.rules_followed_pct)}% of your recent trades.`;
  else if (stats?.journal_days_30 > 0) note = `You journaled on ${stats.journal_days_30} of the last 30 days.`;
  else note = FALLBACK;
  return BANNED.test(note) ? FALLBACK : note;
}

export function createLedgerBotApi(pool, { authenticate }) {
  return async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    try {
      if (request.method === 'PUT') {
        const { error, data } = await readJson(request, 512);
        if (error || typeof data?.pop !== 'boolean') return send(response, error ?? 400, { error: 'Choose on or off.' });
        await pool.query('INSERT INTO ledger_bot_settings(user_id,pop) VALUES($1,$2) ON CONFLICT (user_id) DO UPDATE SET pop=excluded.pop, updated_at=now()', [claims.uid, data.pop]);
        return send(response, 200, { pop: data.pop });
      }
      const { rows: [row] } = await pool.query('SELECT pop FROM ledger_bot_settings WHERE user_id=$1', [claims.uid]);
      const wantsNote = new URL(request.url, 'http://localhost').searchParams.get('note') === '1';
      let note = null;
      if (wantsNote) note = noteFor(await studentStats(pool, claims.uid, { level1: true }));
      send(response, 200, { pop: row?.pop ?? true, note });
    } catch (e) {
      console.error('Ledger bot request failed (' + (e.code ?? 'unknown') + ').');
      send(response, 503, { error: 'Ledger is unavailable right now.' });
    }
  };
}
