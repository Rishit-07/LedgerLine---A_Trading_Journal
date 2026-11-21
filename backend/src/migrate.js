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
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('ledgerline-migrations'))");
  await client.query('CREATE TABLE IF NOT EXISTS ledgerline_schema_migrations(name text PRIMARY KEY)');
  for (const [i,name] of files.entries()) {
    if ((await client.query('SELECT 1 FROM ledgerline_schema_migrations WHERE name=$1',[name])).rowCount) continue;
    await client.query(migrations[i]);
    await client.query('INSERT INTO ledgerline_schema_migrations VALUES ($1)',[name]);
  }
  await client.query('COMMIT');
  console.log('Ledgerline database schema is ready.');
} catch (error) {
  console.error('Database migration failed (' + (error.code ?? 'connection error') + ').');
  process.exitCode = 1;
} finally {
  await client.end();
}
