import { createServer } from 'node:http';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import pg from 'pg';
import { isEmail, readJson, send } from './http.js';
import { createDashboardHandler, createTradeHandler } from './dashboard.js';
import { createOnboardingHandler } from './onboarding.js';
import { createSupportHandler } from './support.js';
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

async function subscribe(request, response) {
  const { data, error } = await readJson(request, 1024);
  if (error) {
    send(response, error, { error: 'Enter a valid email address.' });
    return;
  }
  const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!isEmail(email)) {
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

async function authenticateRequest(request, response) {
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
  return claims;
}

async function loadAccount(request, response) {
  const claims = await authenticateRequest(request, response);
  if (!claims) return;
  const { uid } = claims;
  const find = `SELECT a.created_at AS "createdAt", p.display_name AS "displayName",
    p.onboarded_at IS NOT NULL AS "onboardingCompleted" FROM ledgerline_accounts a
    LEFT JOIN user_profile p ON p.user_id = a.firebase_uid WHERE a.firebase_uid = $1`;
  try {
    const existing = await pool.query(find, [uid]);
    if (existing.rowCount) {
      send(response, 200, existing.rows[0]);
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
    const result = created.rowCount
      ? { createdAt: created.rows[0].created_at, displayName: null, onboardingCompleted: false }
      : (await pool.query(find, [uid])).rows[0];
    send(response, 200, result);
    if (created.rowCount && welcome) deliverWelcome();
  } catch (error) {
    console.error('Could not prepare the Ledgerline account in Postgres (' + (error.code ?? 'unknown error') + ').');
    send(response, 503, { error: 'Your Ledgerline profile is unavailable.' });
  }
}

const routes = new Map([
  ['/api/account', { methods: ['PUT'], handler: loadAccount }],
  ['/api/newsletter', { methods: ['POST'], handler: subscribe }],
  ['/api/support', { methods: ['POST'], handler: createSupportHandler(mailConfig) }],
  ['/api/onboarding', { methods: ['GET', 'PUT'], handler: createOnboardingHandler(pool, authenticateRequest) }],
  ['/api/dashboard', { methods: ['GET'], handler: createDashboardHandler(pool, authenticateRequest) }],
  ['/api/trades', { methods: ['POST'], handler: createTradeHandler(pool, authenticateRequest) }],
]);

const server = createServer((request, response) => {
  const route = routes.get(request.url);
  if (!route) {
    send(response, 404, { error: 'Route not found.' });
    return;
  }
  if (!route.methods.includes(request.method)) {
    response.setHeader('Allow', route.methods.join(', '));
    send(response, 405, { error: 'Method not available for this route.' });
    return;
  }
  void route.handler(request, response);
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log('Ledgerline account API listening on port ' + port);
});
