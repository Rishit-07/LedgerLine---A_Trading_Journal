import { localDay } from './streak-logic.js';
import { createStreakStore } from './streak-store.js';

export const streakReminder = 'Log or review one trade, or note a rest day. Your streak is safe until midnight.';

async function sendReminder(config, email, idempotencyKey) {
  const message = {
    from: config.from,
    to: [email],
    subject: 'Your Ledgerline streak',
    text: streakReminder + '\n\n' + new URL('/journal', config.origin).href,
  };
  if (config.provider === 'gmail') return config.transporter.sendMail({ ...message, to: { address: email } });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(message),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error('Reminder provider returned ' + response.status);
}

export async function runStreakMaintenance(pool, mailConfig, now = new Date()) {
  const { recomputeStreak, listBattles } = createStreakStore(pool, () => now);
  const { rows: due } = await pool.query(`
    SELECT p.user_id FROM user_profile p LEFT JOIN streak_state s USING (user_id)
    WHERE p.onboarded_at IS NOT NULL AND (
      (s.updated_at IS NULL AND EXISTS (SELECT FROM trades t WHERE t.user_id=p.user_id)) OR
      (s.current>0 AND (s.updated_at AT TIME ZONE p.timezone)::date < ($1::timestamptz AT TIME ZONE p.timezone)::date)
    ) ORDER BY s.updated_at NULLS FIRST, p.user_id LIMIT 100
  `, [now]);
  for (const { user_id: uid } of due) {
    try { await recomputeStreak(uid); }
    catch (error) { console.error('Scheduled streak update failed (' + (error.code ?? 'unknown') + ').'); }
  }
  const { rows: expiredBattles } = await pool.query(`
    SELECT DISTINCT challenger_id FROM streak_battles
    WHERE status='active' AND started_on + length_days + 2 <= ($1::timestamptz AT TIME ZONE 'UTC')::date LIMIT 100
  `, [now]);
  for (const { challenger_id: uid } of expiredBattles) {
    try { await listBattles(uid); }
    catch (error) { console.error('Scheduled battle update failed (' + (error.code ?? 'unknown') + ').'); }
  }
  if (!mailConfig) return;
  const { rows: reminders } = await pool.query(`
    SELECT p.user_id, p.timezone, p.streak_reminder_email AS email FROM user_profile p
    WHERE p.onboarded_at IS NOT NULL AND p.streak_reminder_email IS NOT NULL
      AND p.streak_reminder_time <= ($1::timestamptz AT TIME ZONE p.timezone)::time
      AND NOT EXISTS (SELECT FROM streak_reminders_sent r WHERE r.user_id=p.user_id
        AND r.day=($1::timestamptz AT TIME ZONE p.timezone)::date)
      AND NOT EXISTS (SELECT FROM streak_days d WHERE d.user_id=p.user_id
        AND d.day=($1::timestamptz AT TIME ZONE p.timezone)::date)
    ORDER BY p.user_id LIMIT 100
  `, [now]);
  for (const { user_id: uid, timezone, email } of reminders) {
    const day = localDay(now, timezone);
    let claimed = false;
    try {
      const { result } = await recomputeStreak(uid, async (db) => {
        // The profile lock also serializes this claim with changes to notification settings.
        return db.query(`
          INSERT INTO streak_reminders_sent (user_id, day)
          SELECT user_id,$2 FROM user_profile WHERE user_id=$1 AND timezone=$3 AND streak_reminder_email=$4
            AND streak_reminder_time<=($5::timestamptz AT TIME ZONE timezone)::time
          ON CONFLICT DO NOTHING
        `, [uid, day, timezone, email, now]);
      });
      claimed = Boolean(result.rowCount);
      if (!claimed) continue;
      const { rows } = await pool.query('SELECT 1 FROM streak_days WHERE user_id=$1 AND day=$2', [uid, day]);
      if (!rows.length) await sendReminder(mailConfig, email, 'streak-reminder/' + uid + '/' + day);
    } catch (error) {
      if (claimed) await pool.query('DELETE FROM streak_reminders_sent WHERE user_id=$1 AND day=$2', [uid, day]);
      console.error('Streak reminder failed to send (' + (error.code ?? 'unknown') + ').');
    }
  }
}
