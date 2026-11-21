import { createServer } from 'node:http';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import pg from 'pg';
import { isEmail, readJson, send } from './http.js';
import { createDashboardHandler, createTradeHandler } from './dashboard.js';
import { createPlanHandler } from './plan.js';
import { createWorkspaceApi } from './workspace.js';
import { groupHandler } from './group-api.js';
import { createCalendarHandlers } from './calendar.js';
import { createOnboardingHandler } from './onboarding.js';
import { createSupportHandler } from './support.js';
import { createStreakStore } from './streak-store.js';
import { createStreakApi } from './streak-api.js';
import { runStreakMaintenance } from './streak-maintenance.js';
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

const calendar = createCalendarHandlers(pool, authenticateRequest);
const streaks = createStreakStore(pool);
const streak = createStreakApi(pool, authenticateRequest, streaks, { remindersAvailable: Boolean(mailConfig) });
const saveTrade = createTradeHandler(streaks, authenticateRequest);
const workspace = createWorkspaceApi(pool, authenticateRequest);
const routes = new Map([
  ['/api/group-link',{methods:['GET'],handler:async(req,res)=>{
    if(!await authenticateRequest(req,res))return;
    const id=new URL(req.url,'http://localhost').searchParams.get('id');
    try {
      const {rows}=await pool.query('SELECT kind FROM community_before_split.backup_clubs WHERE id::text=$1',[id]);
      send(res,200,{destination:rows.length?(rows[0].kind==='space'?'/spaces/':'/clubs/')+id:'/clubs'});
    }catch{send(res,503,{error:'Group link unavailable.'});}
  }}],
  ['/api/clubs', {methods:['GET','POST'],handler:groupHandler(pool,authenticateRequest,'club')}],
  ['/api/spaces', {methods:['GET','POST'],handler:groupHandler(pool,authenticateRequest,'space')}],
  ['/api/account', { methods: ['PUT'], handler: loadAccount }],
  ['/api/newsletter', { methods: ['POST'], handler: subscribe }],
  ['/api/support', { methods: ['POST'], handler: createSupportHandler(mailConfig) }],
  ['/api/onboarding', { methods: ['GET', 'PUT'], handler: createOnboardingHandler(pool, authenticateRequest) }],
  ['/api/dashboard', { methods: ['GET'], handler: createDashboardHandler(pool, authenticateRequest) }],
  ['/api/plan', { methods: ['GET', 'PUT'], handler: createPlanHandler(pool, authenticateRequest) }],
  ['/api/workspace', { methods: ['GET', 'POST'], handler: workspace.workspace }],
  ['/api/portfolio/public', { methods: ['GET'], handler: workspace.publicPortfolio }],
  ['/api/calendar', { methods: ['GET'], handler: calendar.calendar }],
  ['/api/calendar/month', { methods: ['GET'], handler: calendar.month }],
  ['/api/calendar/day', { methods: ['GET'], handler: calendar.day }],
  ['/api/trades', { methods: ['POST', 'DELETE'], handler: (request, response) =>
    (request.method === 'DELETE' ? streak.remove : saveTrade)(request, response) }],
  ['/api/streak', { methods: ['GET'], handler: streak.status }],
  ['/api/streak/rest-day', { methods: ['POST'], handler: streak.rest }],
  ['/api/streak/review', { methods: ['POST'], handler: streak.review }],
  ['/api/streak/journal', { methods: ['GET'], handler: streak.journal }],
  ['/api/streak/journal/note', { methods: ['POST'], handler: streak.journalNote }],
  ['/api/streak/journal/review', { methods: ['POST'], handler: streak.inboxReview }],
  ...['invite', 'accept', 'end'].map((action) => ['/api/streak/friends/' + action, { methods: ['POST'], handler: streak[action] }]),
  ['/api/streak/friends', { methods: ['GET'], handler: streak.friends }],
  ['/api/streak/friends/preview', { methods: ['GET'], handler: streak.invitePreview }],
  ['/api/streak/battles', { methods: ['GET', 'POST'], handler: (request, response) =>
    (request.method === 'GET' ? streak.battles : streak.challenge)(request, response) }],
  ['/api/streak/badges/seen', { methods: ['POST'], handler: streak.badgesSeen }],
  ['/api/streak/share', { methods: ['GET', 'POST'], handler: (request, response) =>
    (request.method === 'GET' ? streak.shared : streak.share)(request, response) }],
  ['/api/streak/preferences', { methods: ['GET', 'PUT'], handler: (request, response) =>
    (request.method === 'GET' ? streak.preferences : streak.savePreferences)(request, response) }],
]);

const server = createServer((request, response) => {
  const route = routes.get(request.url.split('?', 1)[0]);
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

if (process.env.STREAK_NEON_SCHEDULE !== 'true') {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try { await runStreakMaintenance(pool, mailConfig); }
    catch (error) { console.error('Streak maintenance failed (' + (error.code ?? 'unknown') + ').'); }
    finally { running = false; }
  }, 5 * 60_000).unref();
}
