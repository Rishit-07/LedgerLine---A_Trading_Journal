/* One-off: encrypt billing addresses and GST numbers saved before FIELD_ENCRYPTION_KEY was set.
   Safe to run again; already encrypted values are skipped. Back up the database first. */
import pg from 'pg';
import { encryptField, isEncrypted } from './field-crypto.js';

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url || !process.env.FIELD_ENCRYPTION_KEY) { console.error('Set DATABASE_URL_UNPOOLED and FIELD_ENCRYPTION_KEY first.'); process.exit(2); }
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('BEGIN');
  const { rows } = await client.query('SELECT user_id, gstin, address FROM billing_profiles FOR UPDATE');
  let changed = 0;
  for (const row of rows) {
    if (isEncrypted(row.address) && (!row.gstin || isEncrypted(row.gstin))) continue;
    await client.query('UPDATE billing_profiles SET gstin = $2, address = $3 WHERE user_id = $1', [row.user_id, encryptField(row.gstin), encryptField(row.address)]);
    changed += 1;
  }
  await client.query('COMMIT');
  console.log(`Encrypted ${changed} billing profile(s).`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Encryption failed (' + (error.code ?? error.message) + '). Nothing was changed.');
  process.exitCode = 1;
} finally {
  await client.end();
}
