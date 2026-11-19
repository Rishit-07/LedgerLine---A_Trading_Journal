import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error('Set DATABASE_URL_UNPOOLED in backend/.env.local.');

const directory = new URL('../../database/migrations/', import.meta.url);
const files = (await readdir(directory)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
const migrations = await Promise.all(files.map((file) => readFile(new URL(file, directory), 'utf8')));
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  // Multiple statements in one simple query run in the same implicit transaction.
  await client.query(migrations.join('\n'));
  console.log('Ledgerline database schema is ready.');
} catch (error) {
  console.error('Database migration failed (' + (error.code ?? 'connection error') + ').');
  process.exitCode = 1;
} finally {
  await client.end();
}
