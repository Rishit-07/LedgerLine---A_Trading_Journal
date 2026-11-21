import { readJson, send } from './http.js';

const biases = new Set(['Bullish', 'Neutral', 'Bearish']);

const fields = "bias, levels, locked_at IS NOT NULL AS locked";

export function createPlanHandler(pool, authenticate) {
  return async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    const { uid } = claims;
    const tomorrow=new URL(request.url,'http://localhost').searchParams.get('day')==='tomorrow';
    const today=tomorrow?"((now() AT TIME ZONE (SELECT timezone FROM user_profile WHERE user_id=$1))::date+1)":"(now() AT TIME ZONE 'Asia/Kolkata')::date";
    try {
      if (request.method === 'GET') {
        const { rows } = await pool.query(`SELECT ${fields} FROM plans WHERE user_id=$1 AND date=${today}`, [uid]);
        return send(response, 200, { plan: rows[0] ?? null });
      }

      const { error, data } = await readJson(request, 12_000);
      if (error) return send(response, error, { error: 'Enter valid plan details.' });
      if (data?.action === 'unlock') {
        const { rows } = await pool.query(`
          UPDATE plans SET locked_at=NULL WHERE user_id=$1 AND date=${today} RETURNING ${fields}
        `, [uid]);
        return send(response, 200, { plan: rows[0] ?? null });
      }
      const options = data?.options;
      const optionValid = options === undefined || (Array.isArray(options?.setups) && options.setups.length <= 3 &&
        options.setups.every((setup) => typeof setup === 'string' && setup.trim() && setup.length <= 100) &&
        Number.isInteger(options.maxTrades) && options.maxTrades >= 1 && options.maxTrades <= 30 &&
        typeof options.maxLoss === 'number' && Number.isFinite(options.maxLoss) && options.maxLoss >= .25 && options.maxLoss <= 20 &&
        ['', 'Calm','Rushed','Fearful','Confident'].includes(options.mood));
      if (!['save', 'lock'].includes(data?.action) || !biases.has(data.bias) || !optionValid ||
        typeof data.levels !== 'string' || data.levels.length > 500 ||
        typeof data.notes !== 'string' || data.notes.length > 1000) {
        return send(response, 400, { error: 'Choose a bias and keep your plan within the field limits.' });
      }
      const { rows } = await pool.query(`
        INSERT INTO plans (user_id, date, bias, levels, rules_snapshot, locked_at)
        SELECT p.user_id, ${today}, $2, $3,
          coalesce((SELECT jsonb_agg(jsonb_build_object('id', id::text, 'text', text, 'hard', hard) ORDER BY position)
            FROM rules WHERE user_id=$1 AND active), '[]'::jsonb),
          CASE WHEN $4 THEN now() END
        FROM user_profile p WHERE p.user_id=$1 AND p.onboarded_at IS NOT NULL
        ON CONFLICT (user_id,date) DO UPDATE SET bias=excluded.bias, levels=plans.levels || excluded.levels,
          rules_snapshot=excluded.rules_snapshot, locked_at=excluded.locked_at
        WHERE plans.locked_at IS NULL
        RETURNING ${fields}
      `, [uid, data.bias, { watched: data.levels.trim(), notes: data.notes.trim(),
        ...(options ? { setups:[...new Set(options.setups.map((value)=>value.trim()))], maxTrades:options.maxTrades,
          maxLoss:options.maxLoss, mood:options.mood } : {}) }, data.action === 'lock']);
      if (!rows.length) return send(response, 409, { error: 'Unlock the plan before editing it. Finish onboarding to create a plan.' });
      return send(response, 200, { plan: rows[0] });
    } catch (error) {
      console.error('Could not update the pre-market plan (' + (error.code ?? 'unknown') + ').');
      send(response, 503, { error: 'The pre-market plan is temporarily unavailable.' });
    }
  };
}
