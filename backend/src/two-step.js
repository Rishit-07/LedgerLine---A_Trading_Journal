/* Two-step sign-in: setup, checking codes and recovery codes, and the signed "second step done" session.
   A person who turned it on must present a session proving they entered a code for THIS sign-in (it is bound
   to the Firebase sign-in time, so signing in again asks again). Needs FIELD_ENCRYPTION_KEY. */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptField, encryptField } from './field-crypto.js';
import { matchStep, newSecret, otpauthUrl } from './totp.js';
import { readJson, send } from './http.js';

export const SESSION_HOURS = 12;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const RECOVERY = /^[a-z0-9]{5}-[a-z0-9]{5}$/;
const hash = (text) => createHash('sha256').update(text.toLowerCase()).digest('hex');

export const available = (env = process.env) => Boolean(env.FIELD_ENCRYPTION_KEY);
const signingKey = (env) => createHmac('sha256', Buffer.from(env.FIELD_ENCRYPTION_KEY, 'base64')).update('ledgerline-two-step-session').digest();

export function mintSession(uid, authTime, env = process.env, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ u: uid, a: authTime, e: now + SESSION_HOURS * 3600_000 })).toString('base64url');
  return body + '.' + createHmac('sha256', signingKey(env)).update(body).digest('base64url');
}

export function checkSession(token, uid, authTime, env = process.env, now = Date.now()) {
  if (typeof token !== 'string' || !available(env)) return false;
  const [body, mac] = token.split('.');
  if (!body || !mac) return false;
  const good = createHmac('sha256', signingKey(env)).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== good.length || !timingSafeEqual(given, good)) return false;
  try {
    const claim = JSON.parse(Buffer.from(body, 'base64url').toString());
    return claim.u === uid && claim.a === authTime && claim.e > now;
  } catch { return false; }
}

export function newRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString('hex').slice(0, 10);
    return raw.slice(0, 5) + '-' + raw.slice(5);
  });
}

class TwoStepError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }

/** `query(sql, params)` returns rows. Pass a transaction-bound function to keep these steps atomic. */
export function createTwoStepStore(query) {
  return {
    async enabled(uid) {
      const [row] = await query('SELECT 1 FROM user_totp WHERE user_id = $1 AND enabled_at IS NOT NULL', [uid]);
      return Boolean(row);
    },

    async begin(uid, account) {
      const [existing] = await query('SELECT enabled_at FROM user_totp WHERE user_id = $1 FOR UPDATE', [uid]);
      if (existing?.enabled_at) throw new TwoStepError(409, 'Two-step sign-in is already on.');
      const secret = newSecret();
      await query(`INSERT INTO user_totp (user_id, secret) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET secret = excluded.secret, failed_attempts = 0, locked_until = NULL, last_step = 0`, [uid, encryptField(secret)]);
      return { secret, url: otpauthUrl(secret, account) };
    },

    /** Check a 6-digit code or a recovery code. Locks after repeated misses.
        Returns { ok: true } or { ok: false, status, message }. A wrong code does not throw, so the miss is saved with the transaction. */
    async check(uid, code, { allowPending = false, now = Date.now() } = {}) {
      const [row] = await query('SELECT secret, enabled_at, last_step, failed_attempts, locked_until FROM user_totp WHERE user_id = $1 FOR UPDATE', [uid]);
      if (!row || (!row.enabled_at && !allowPending)) throw new TwoStepError(400, 'Two-step sign-in is not set up.');
      if (row.locked_until && new Date(row.locked_until).getTime() > now) {
        return { ok: false, status: 429, message: 'Too many wrong codes. Try again in a few minutes.' };
      }
      const text = String(code ?? '').trim();
      let ok = false;
      const step = matchStep(decryptField(row.secret), text, now);
      if (step !== null && step > Number(row.last_step)) {
        await query('UPDATE user_totp SET last_step = $2 WHERE user_id = $1', [uid, step]);
        ok = true;
      } else if (row.enabled_at && RECOVERY.test(text.toLowerCase())) {
        const used = await query('UPDATE totp_recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING 1', [uid, hash(text)]);
        ok = used.length > 0;
      }
      if (ok) {
        await query('UPDATE user_totp SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1', [uid]);
        return { ok: true };
      }
      const failures = row.failed_attempts + 1;
      await query('UPDATE user_totp SET failed_attempts = $2, locked_until = $3 WHERE user_id = $1',
        [uid, failures >= MAX_FAILURES ? 0 : failures, failures >= MAX_FAILURES ? new Date(now + LOCK_MINUTES * 60_000) : null]);
      return { ok: false, status: 401, message: 'That code is not right. Check your app and try the new code.' };
    },

    async turnOn(uid, code) {
      const result = await this.check(uid, code, { allowPending: true });
      if (!result.ok) return result;
      await query('UPDATE user_totp SET enabled_at = now() WHERE user_id = $1 AND enabled_at IS NULL', [uid]);
      const codes = newRecoveryCodes();
      await query('DELETE FROM totp_recovery_codes WHERE user_id = $1', [uid]);
      for (const c of codes) await query('INSERT INTO totp_recovery_codes (user_id, code_hash) VALUES ($1, $2)', [uid, hash(c)]);
      return { ok: true, codes };
    },

    async turnOff(uid, code) {
      const result = await this.check(uid, code);
      if (!result.ok) return result;
      await query('DELETE FROM totp_recovery_codes WHERE user_id = $1', [uid]);
      await query('DELETE FROM user_totp WHERE user_id = $1', [uid]);
      return { ok: true };
    },

    async recoveryLeft(uid) {
      const [row] = await query('SELECT count(*)::int AS n FROM totp_recovery_codes WHERE user_id = $1 AND used_at IS NULL', [uid]);
      return row?.n ?? 0;
    },
  };
}

/** HTTP handlers. `authenticate(request, response, { skipSecondStep: true })` must skip the gate, so these can be reached before the code is entered. */
export function createTwoStepApi(pool, authenticate) {
  const inTransaction = async (work) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(createTwoStepStore(async (sql, params) => (await client.query(sql, params)).rows));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  };
  const fail = (response, error) => error instanceof TwoStepError
    ? send(response, error.status, { error: error.message, ...error.extra })
    : (console.error('Two-step sign-in failed (' + (error?.code ?? error?.name ?? 'error') + ').'), send(response, 503, { error: 'Two-step sign-in is unavailable. Try again in a moment.' }));
  const guard = async (request, response) => {
    const claims = await authenticate(request, response, { skipSecondStep: true });
    if (!claims) return null;
    if (!available()) { send(response, 503, { error: 'Two-step sign-in is not set up on this server yet.' }); return null; }
    return claims;
  };
  const body = async (request, response) => {
    const { data, error } = await readJson(request, 512);
    if (error || !data || typeof data.code !== 'string') { send(response, error ?? 400, { error: 'Enter your code.' }); return null; }
    return data;
  };

  return {
    async status(request, response) {
      const claims = await authenticate(request, response, { skipSecondStep: true });
      if (!claims) return;
      try {
        const store = createTwoStepStore(async (sql, params) => (await pool.query(sql, params)).rows);
        const enabled = await store.enabled(claims.uid);
        send(response, 200, { enabled, available: available(), recoveryLeft: enabled ? await store.recoveryLeft(claims.uid) : 0,
          verified: enabled && checkSession(request.headers['x-mfa-session'], claims.uid, claims.auth_time) });
      } catch (error) { fail(response, error); }
    },
    async setup(request, response) {
      const claims = await guard(request, response); if (!claims) return;
      try { send(response, 200, await inTransaction((store) => store.begin(claims.uid, claims.email ?? claims.uid))); } catch (error) { fail(response, error); }
    },
    async enable(request, response) {
      const claims = await guard(request, response); if (!claims) return;
      const data = await body(request, response); if (!data) return;
      try {
        const result = await inTransaction((store) => store.turnOn(claims.uid, data.code));
        if (!result.ok) return send(response, result.status, { error: result.message });
        send(response, 200, { enabled: true, recoveryCodes: result.codes, session: mintSession(claims.uid, claims.auth_time) });
      } catch (error) { fail(response, error); }
    },
    async verify(request, response) {
      const claims = await guard(request, response); if (!claims) return;
      const data = await body(request, response); if (!data) return;
      try {
        const result = await inTransaction((store) => store.check(claims.uid, data.code));
        if (!result.ok) return send(response, result.status, { error: result.message });
        send(response, 200, { session: mintSession(claims.uid, claims.auth_time) });
      } catch (error) { fail(response, error); }
    },
    async disable(request, response) {
      const claims = await guard(request, response); if (!claims) return;
      const data = await body(request, response); if (!data) return;
      try {
        const result = await inTransaction((store) => store.turnOff(claims.uid, data.code));
        if (!result.ok) return send(response, result.status, { error: result.message });
        send(response, 200, { enabled: false });
      } catch (error) { fail(response, error); }
    },
  };
}
