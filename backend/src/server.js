import { createServer } from 'node:http';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import pg from 'pg';

const projectId = process.env.FIREBASE_PROJECT_ID;
const connectionString = process.env.DATABASE_URL;
if (!projectId || !connectionString) {
  throw new Error('Set FIREBASE_PROJECT_ID and DATABASE_URL in backend/.env.local.');
}

const auth = getAuth(initializeApp({ projectId }));
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
pool.on('error', () => console.error('An idle database connection failed.'));

function send(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.url !== '/api/account') {
    send(response, 404, { error: 'Route not found.' });
    return;
  }
  if (request.method !== 'PUT') {
    response.setHeader('Allow', 'PUT');
    send(response, 405, { error: 'Use PUT for this route.' });
    return;
  }

  const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) {
    send(response, 401, { error: 'Sign in to continue.' });
    return;
  }
  let uid;
  try {
    ({ uid } = await auth.verifyIdToken(token));
  } catch {
    send(response, 401, { error: 'Sign in again to continue.' });
    return;
  }

  try {
    const created = await pool.query(
      'INSERT INTO ledgerline_accounts (firebase_uid) VALUES ($1) ON CONFLICT DO NOTHING RETURNING created_at',
      [uid],
    );
    const result = created.rowCount
      ? created
      : await pool.query('SELECT created_at FROM ledgerline_accounts WHERE firebase_uid = $1', [uid]);
    send(response, 200, { createdAt: result.rows[0].created_at });
  } catch {
    console.error('Could not prepare the Ledgerline account in Postgres.');
    send(response, 503, { error: 'Your Ledgerline profile is unavailable.' });
  }
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log('Ledgerline account API listening on port ' + port);
});
