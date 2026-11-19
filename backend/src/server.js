import { createServer } from 'node:http';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import pg from 'pg';
import { prepareWelcome, readMailConfig, startWelcomeDelivery } from './welcome-email.js';

const projectId = process.env.FIREBASE_PROJECT_ID;
const connectionString = process.env.DATABASE_URL;
if (!projectId || !connectionString) {
  throw new Error('Set FIREBASE_PROJECT_ID and DATABASE_URL in backend/.env.local.');
}

const auth = getAuth(initializeApp({ projectId }));
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
pool.on('error', () => console.error('An idle database connection failed.'));
const mailConfig = readMailConfig(process.env);
const deliverWelcome = startWelcomeDelivery(pool, mailConfig);

function send(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function subscribe(request, response) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    request.resume();
    send(response, 415, { error: 'Send the email address as JSON.' });
    return;
  }

  let email;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > 1024) {
        request.resume();
        send(response, 413, { error: 'Subscription request is too large.' });
        return;
      }
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))?.email;
    email = typeof input === 'string' ? input.trim().toLowerCase() : '';
  } catch {
    send(response, 400, { error: 'Enter a valid email address.' });
    return;
  }

  const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
  if (email.length > 254 || !emailPattern.test(email)) {
    send(response, 400, { error: 'Enter a valid email address.' });
    return;
  }
  try {
    await pool.query('INSERT INTO ledgerline_newsletter_subscriptions (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [email]);
    send(response, 200, { subscribed: true });
  } catch {
    console.error('Could not save a newsletter subscription.');
    send(response, 503, { error: 'Subscriptions are temporarily unavailable.' });
  }
}

async function loadAccount(request, response) {
  const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) {
    send(response, 401, { error: 'Sign in to continue.' });
    return;
  }
  let claims;
  try {
    claims = await auth.verifyIdToken(token);
  } catch {
    send(response, 401, { error: 'Sign in again to continue.' });
    return;
  }
  if (claims.email_verified !== true) {
    send(response, 403, { error: 'Verify your email address to continue.' });
    return;
  }

  const { uid } = claims;
  try {
    const find = 'SELECT created_at FROM ledgerline_accounts WHERE firebase_uid = $1';
    const existing = await pool.query(find, [uid]);
    if (existing.rowCount) {
      send(response, 200, { createdAt: existing.rows[0].created_at });
      return;
    }
    const welcome = prepareWelcome(mailConfig, claims);
    const created = await pool.query(`
      WITH account AS (
        INSERT INTO ledgerline_accounts (firebase_uid) VALUES ($1)
        ON CONFLICT (firebase_uid) DO NOTHING RETURNING firebase_uid, created_at
      ), welcome AS (
        INSERT INTO ledgerline_welcome_emails (firebase_uid, payload)
        SELECT firebase_uid, $2::jsonb FROM account WHERE $2::jsonb IS NOT NULL
      )
      SELECT created_at FROM account
    `, [uid, welcome]);
    const result = created.rowCount ? created : await pool.query(find, [uid]);
    send(response, 200, { createdAt: result.rows[0].created_at });
    if (created.rowCount && welcome) deliverWelcome();
  } catch (error) {
    console.error('Could not prepare the Ledgerline account in Postgres (' + (error.code ?? 'unknown error') + ').');
    send(response, 503, { error: 'Your Ledgerline profile is unavailable.' });
  }
}

const routes = new Map([
  ['/api/account', { method: 'PUT', handler: loadAccount }],
  ['/api/newsletter', { method: 'POST', handler: subscribe }],
]);

const server = createServer((request, response) => {
  const route = routes.get(request.url);
  if (!route) {
    send(response, 404, { error: 'Route not found.' });
    return;
  }
  if (request.method !== route.method) {
    response.setHeader('Allow', route.method);
    send(response, 405, { error: `Use ${route.method} for this route.` });
    return;
  }
  void route.handler(request, response);
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log('Ledgerline account API listening on port ' + port);
});
