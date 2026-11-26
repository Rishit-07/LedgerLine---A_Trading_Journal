/* Notification settings: the kind-by-channel switches, quiet hours, delivery style and push devices. */
import { readJson, send } from './http.js';
import { KINDS, lockedKinds } from './notification-kinds.js';

export const SWITCHABLE = ['journal_reminder', 'streak_risk', 'spaces', 'community', 'rewards', 'account'];
const CHANNELS = ['in_app', 'push', 'email'];
// Push starts off for everyone: a browser must grant permission first.
export const DEFAULTS = {
  journal_reminder: { in_app: true, push: false, email: true },
  streak_risk: { in_app: true, push: false, email: false },
  spaces: { in_app: true, push: false, email: true },
  community: { in_app: true, push: false, email: false },
  rewards: { in_app: true, push: false, email: false },
  account: { in_app: true, push: false, email: false },
};

export function createNotificationSettingsApi(pool, authenticate) {
  const read = async (uid) => {
    const { rows } = await pool.query('SELECT kind,in_app,push,email FROM notification_prefs WHERE user_id=$1', [uid]);
    const matrix = Object.fromEntries(SWITCHABLE.map((kind) => [kind, { ...DEFAULTS[kind] }]));
    for (const row of rows) if (matrix[row.kind]) matrix[row.kind] = { in_app: row.in_app, push: row.push, email: row.email };
    const { rows: [s] } = await pool.query('SELECT email,quiet,delivery,tz FROM notification_settings WHERE user_id=$1', [uid]);
    const { rows: [t] } = await pool.query('SELECT count(*)::int AS n FROM push_tokens WHERE user_id=$1', [uid]);
    return {
      matrix, quiet: s?.quiet ?? '22-07', delivery: s?.delivery ?? 'instant', tz: s?.tz ?? 'Asia/Kolkata',
      pushDevices: t.n, hasEmail: Boolean(s?.email),
      always: lockedKinds().map((kind) => KINDS[kind].label),
      labels: Object.fromEntries(SWITCHABLE.map((kind) => [kind, KINDS[kind].label])),
    };
  };

  const main = async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    if (request.method === 'GET') return send(response, 200, await read(claims.uid));
    const { error, data } = await readJson(request, 1024);
    if (error || !data) return send(response, error ?? 400, { error: 'Enter a valid request.' });
    // Remember the verified email so email can be sent without a Firebase lookup.
    const email = claims.email_verified === true && claims.email ? String(claims.email).slice(0, 254) : null;
    const ensure = () => pool.query(
      `INSERT INTO notification_settings(user_id,email) VALUES($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET email=COALESCE($2, notification_settings.email), updated_at=now()`, [claims.uid, email]);
    if (data.kind !== undefined) {
      // Always-on kinds are not in the list, so any attempt to switch them off is ignored.
      if (!SWITCHABLE.includes(data.kind) || !CHANNELS.includes(data.channel) || typeof data.value !== 'boolean') {
        return send(response, 200, await read(claims.uid));
      }
      if (data.channel === 'email' && data.value && !email) {
        const { rows: [s] } = await pool.query('SELECT email FROM notification_settings WHERE user_id=$1', [claims.uid]);
        if (!s?.email) return send(response, 409, { error: 'Verify your email address to get email.' });
      }
      await ensure();
      // A first change starts from the defaults with this one switch applied; later changes touch only that switch.
      const start = { ...DEFAULTS[data.kind], [data.channel]: data.value };
      await pool.query(
        `INSERT INTO notification_prefs(user_id,kind,in_app,push,email) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT (user_id,kind) DO UPDATE SET ${data.channel}=$6, updated_at=now()`,
        [claims.uid, data.kind, start.in_app, start.push, start.email, data.value]);
    } else if (data.quiet !== undefined || data.delivery !== undefined) {
      if ((data.quiet !== undefined && !['off', '22-07', '23-06'].includes(data.quiet)) || (data.delivery !== undefined && !['instant', 'daily'].includes(data.delivery))) {
        return send(response, 400, { error: 'Choose one of the options.' });
      }
      await ensure();
      await pool.query('UPDATE notification_settings SET quiet=COALESCE($2,quiet), delivery=COALESCE($3,delivery), updated_at=now() WHERE user_id=$1',
        [claims.uid, data.quiet ?? null, data.delivery ?? null]);
    } else {
      return send(response, 400, { error: 'Unknown change.' });
    }
    send(response, 200, await read(claims.uid));
  };

  /* POST saves a device token; DELETE removes it (switching push off on that device). */
  const push = async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    const { error, data } = await readJson(request, 6000);
    if (error || !data || typeof data.deviceId !== 'string' || data.deviceId.length < 8 || data.deviceId.length > 80) {
      return send(response, error ?? 400, { error: 'Enter a valid device.' });
    }
    if (request.method === 'DELETE') {
      await pool.query('DELETE FROM push_tokens WHERE user_id=$1 AND device_id=$2', [claims.uid, data.deviceId]);
    } else {
      if (typeof data.token !== 'string' || !data.token || data.token.length > 4096) return send(response, 400, { error: 'Enter a valid device token.' });
      const { rows: [c] } = await pool.query('SELECT count(*)::int AS n FROM push_tokens WHERE user_id=$1 AND device_id<>$2', [claims.uid, data.deviceId]);
      if (c.n >= 10) return send(response, 409, { error: 'Too many devices. Remove one first.' });
      await pool.query(
        `INSERT INTO ledgerline_accounts(firebase_uid) VALUES($1) ON CONFLICT DO NOTHING`, [claims.uid]);
      await pool.query(
        `INSERT INTO push_tokens(user_id,device_id,token) VALUES($1,$2,$3)
         ON CONFLICT (user_id,device_id) DO UPDATE SET token=$3, last_seen=now()`, [claims.uid, data.deviceId, data.token]);
    }
    send(response, 200, await read(claims.uid));
  };
  return { main, push };
}
