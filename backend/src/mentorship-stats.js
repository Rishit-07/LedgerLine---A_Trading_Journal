// Numbers a mentor may see about a student. Everything is computed here from the journal, never taken from the browser,
// and anything above the level the student shared is simply not queried.
const MIN_TRADES = 10;
const cutoff = (days) => new Date(Date.now() - days * 864e5);

export async function studentStats(pool, studentId, share) {
  const since30 = cutoff(30), since56 = cutoff(56);
  const [{ rows: [n] }, { rows: [rules] }, { rows: [streak] }, { rows: mistakes }, { rows: weeks }, { rows: [days] }] = await Promise.all([
    pool.query('SELECT count(*)::int closed FROM trades WHERE user_id=$1 AND closed_at IS NOT NULL', [studentId]),
    pool.query(`SELECT count(*) FILTER (WHERE c.kept)::int kept, count(*)::int total FROM trade_checks c JOIN trades t ON t.user_id=c.user_id AND t.id=c.trade_id
      WHERE c.user_id=$1 AND t.opened_at>=$2`, [studentId, since30]),
    pool.query('SELECT current, best FROM streak_state WHERE user_id=$1', [studentId]),
    pool.query('SELECT kind, count(*)::int n FROM mistakes WHERE user_id=$1 AND created_at>=$2 GROUP BY kind ORDER BY n DESC', [studentId, since30]),
    pool.query(`SELECT to_char(date_trunc('week', t.opened_at),'YYYY-MM-DD') week, count(*) FILTER (WHERE c.kept)::int kept, count(*)::int total
      FROM trade_checks c JOIN trades t ON t.user_id=c.user_id AND t.id=c.trade_id WHERE c.user_id=$1 AND t.opened_at>=$2 GROUP BY 1 ORDER BY 1`, [studentId, since56]),
    pool.query('SELECT count(*)::int d FROM streak_days WHERE user_id=$1 AND day>=$2', [studentId, since30]),
  ]);
  const enough = n.closed >= MIN_TRADES;
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
  const out = {
    level: 1,
    trades_closed: n.closed,
    enough_data: enough,
    journal_days_30: days.d,
    streak: { current: streak?.current ?? 0, best: streak?.best ?? 0 },
    rules_followed_pct: enough ? pct(rules.kept, rules.total) : 'not_enough_data',
    mistakes_30d: mistakes,
    weekly_rules_pct: enough ? weeks.map((w) => ({ week: w.week, pct: pct(w.kept, w.total) })) : [],
  };
  if (share.level2) {
    out.level = 2;
    if (!enough) out.results = 'not_enough_data';
    else {
      const { rows: [r] } = await pool.query(`SELECT count(*) FILTER (WHERE r_multiple>0)::int wins, count(*)::int n,
        coalesce(avg(r_multiple),0)::float avg_r, coalesce(sum(r_multiple),0)::float cum_r FROM trades WHERE user_id=$1 AND closed_at IS NOT NULL`, [studentId]);
      out.results = { win_rate_pct: pct(r.wins, r.n), avg_r: Math.round(r.avg_r * 100) / 100, cumulative_r: Math.round(r.cum_r * 100) / 100 };
    }
  } else out.results = 'not_shared';
  if (share.level3) {
    out.level = 3;
    const { rows } = await pool.query("SELECT coalesce(setup,'') setup, count(*)::int n FROM trades WHERE user_id=$1 AND closed_at IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 12", [studentId]);
    out.setups = rows;
  } else out.setups = 'not_shared';
  // Plain-language strengths and gaps from the same tags, with the numbers visible.
  const notes = [];
  if (enough && typeof out.rules_followed_pct === 'number') notes.push(out.rules_followed_pct >= 80 ? `Rules kept on ${out.rules_followed_pct}% of checked trades.` : `Rules kept on ${out.rules_followed_pct}% of checked trades. This is the main thing to work on.`);
  if (mistakes[0]) notes.push(`Most common mistake tag: ${mistakes[0].kind} (${mistakes[0].n} in 30 days).`);
  if (days.d < 12) notes.push(`Journaled ${days.d} of the last 30 days.`);
  out.summary = notes;
  return out;
}

export async function cachedStats(pool, studentId, share, maxAgeMs = 3600_000) {
  const key = `${share.level2 ? 2 : 1}${share.level3 ? 3 : ''}`;
  const { rows: [hit] } = await pool.query('SELECT data, computed_at FROM student_rollups WHERE student_id=$1', [studentId]);
  if (hit && hit.data.key === key && Date.now() - new Date(hit.computed_at).getTime() < maxAgeMs) return hit.data.stats;
  const stats = await studentStats(pool, studentId, share);
  await pool.query(`INSERT INTO student_rollups(student_id,data) VALUES($1,$2) ON CONFLICT (student_id) DO UPDATE SET data=excluded.data, computed_at=now()`, [studentId, { key, stats }]);
  return stats;
}
