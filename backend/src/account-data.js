/* Data rights: export everything held about the signed-in account, and delete it.
   Both discover tables from the database catalogue, so a table added later is covered without editing this file. */
import { createHash } from 'node:crypto';
import { readJson, send } from './http.js';
import { decryptField } from './field-crypto.js';

export const TERMS_VERSION = '2026-11';
const OWNER_COLUMNS = ['user_id', 'firebase_uid', 'owner_id', 'author_id'];
const MAX_ROWS_PER_TABLE = 50_000;

/** Tables and columns that hold this account's id. Schema and table names come from the catalogue, never from the request. */
async function ownedColumns(db) {
  const { rows } = await db.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = ANY($1::text[])
       AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
     ORDER BY table_name, column_name`, [OWNER_COLUMNS]);
  return rows;
}

export async function exportAccount(db, uid) {
  const out = { exportedAt: new Date().toISOString(), format: 'ledgerline-export-1', tables: {}, note: 'Images such as your profile picture and trade screenshots are binary and are left out of this file.' };
  for (const { table_name: table, column_name: column } of await ownedColumns(db)) {
    const { rows } = await db.query(
      `SELECT to_jsonb(t) - ARRAY(SELECT c.column_name FROM information_schema.columns c
          WHERE c.table_schema='public' AND c.table_name=$3 AND c.data_type='bytea') AS row
       FROM public.${quote(table)} t WHERE t.${quote(column)} = $1 LIMIT $2`, [uid, MAX_ROWS_PER_TABLE, table]);
    if (rows.length) out.tables[table] = [...(out.tables[table] ?? []), ...rows.map((r) => unlock(r.row))];
  }
  return out;
}

/** Give people their own billing details in readable form, including ones inside invoice records. */
function unlock(value) {
  if (typeof value === 'string') { try { return decryptField(value); } catch { return value; } }
  if (Array.isArray(value)) return value.map(unlock);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unlock(v)]));
  return value;
}

const quote = (name) => '"' + String(name).replace(/"/g, '""') + '"';

/** Remove the account and everything that belongs to it in one transaction. Returns how many rows went. */
export async function deleteAccount(pool, uid) {
  const client = await pool.connect();
  let removed = 0;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '60s'");
    const columns = await ownedColumns(client);
    // Child tables first. Repeat while rows remain, because some tables depend on others (replies on posts).
    const targets = columns.filter((c) => c.table_name !== 'ledgerline_accounts');
    for (let pass = 0; pass < 4 && targets.length; pass += 1) {
      let progress = 0;
      for (const { table_name: table, column_name: column } of targets) {
        await client.query('SAVEPOINT row_group');
        try {
          const result = await client.query(`DELETE FROM public.${quote(table)} WHERE ${quote(column)} = $1`, [uid]);
          progress += result.rowCount;
          removed += result.rowCount;
          await client.query('RELEASE SAVEPOINT row_group');
        } catch (error) {
          if (error.code !== '23503') throw error; // blocked by a row in another table: try again next pass
          await client.query('ROLLBACK TO SAVEPOINT row_group');
        }
      }
      if (!progress) break;
    }
    const account = await client.query('DELETE FROM ledgerline_accounts WHERE firebase_uid = $1', [uid]);
    removed += account.rowCount;
    await client.query('INSERT INTO account_deletions (account_hash, rows_removed) VALUES ($1, $2)',
      [createHash('sha256').update(uid).digest('hex'), removed]);
    await client.query('COMMIT');
    return removed;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Record that this account accepted the current terms and privacy notice at sign-up. The time is the server's, never the client's. */
export async function recordTerms(db, uid, version) {
  if (version !== TERMS_VERSION) return;
  await db.query(
    `INSERT INTO terms_acceptances (user_id, document, version, method)
     SELECT $1, d, $2, 'signup_checkbox' FROM unnest(ARRAY['terms','privacy']) d
     ON CONFLICT (user_id, document, version) DO NOTHING`, [uid, version]);
}

export function createAccountDataApi(pool, authenticate, firebaseAuth) {
  return {
    async export(request, response) {
      const claims = await authenticate(request, response);
      if (!claims) return;
      try {
        const data = await exportAccount(pool, claims.uid);
        response.setHeader?.('Content-Disposition', 'attachment; filename="ledgerline-export.json"');
        send(response, 200, data);
      } catch {
        console.error('Could not export an account.');
        send(response, 503, { error: 'Your data export is unavailable. Try again in a moment.' });
      }
    },
    async remove(request, response) {
      const claims = await authenticate(request, response);
      if (!claims) return;
      const { data, error } = await readJson(request, 1024);
      if (error) return send(response, error, { error: 'Send the confirmation as JSON.' });
      if (data?.confirm !== 'DELETE') return send(response, 400, { error: 'Type DELETE to confirm.' });
      // A token minted long ago is not proof the person is here now.
      if (!claims.auth_time || Date.now() / 1000 - claims.auth_time > 10 * 60) {
        return send(response, 401, { error: 'Sign in again, then delete your account.', reauthenticate: true });
      }
      try {
        await deleteAccount(pool, claims.uid);
      } catch {
        console.error('Could not delete an account.');
        return send(response, 503, { error: 'We could not delete your account. Nothing was removed. Try again in a moment.' });
      }
      try { await firebaseAuth.deleteUser(claims.uid); } catch (cause) {
        if (cause?.code !== 'auth/user-not-found') console.error('Database rows were deleted but the sign-in record was not (' + (cause?.code ?? 'unknown') + ').');
      }
      send(response, 200, { deleted: true });
    },
  };
}
