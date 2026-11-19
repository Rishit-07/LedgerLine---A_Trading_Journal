import { readFile } from 'node:fs/promises';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error('Set DATABASE_URL_UNPOOLED in backend/.env.local.');

const migration = await readFile(new URL('../../database/migrations/001_accounts.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query(migration);
  console.log('Ledgerline account schema is ready.');
} catch (error) {
  console.error('Account migration failed (' + (error.code ?? 'connection error') + ').');
  process.exitCode = 1;
} finally {
  await client.end();
}
