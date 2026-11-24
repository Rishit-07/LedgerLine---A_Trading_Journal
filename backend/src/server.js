import {createProfilePictureHandler} from './profile-picture.js';
import {startBillingMail} from './billing-mail.js';
import {billingApi} from './report-billing.js';
import {billingProfile} from './billing-profile.js';
import {startMentorMail} from './mentor-mail.js';
import {mentorVerification} from './mentor-verification.js';
import {reportApi} from './reports.js';
import { createServer } from 'node:http';
import { initializeApp } from 'firebase-admin/app';
import { checkSession, createTwoStepApi, createTwoStepStore } from './two-step.js';
import { configureErrorReport, reportError } from './error-report.js';
import { createAppCheckGate } from './app-check.js';
import { getAuth } from 'firebase-admin/auth';
import pg from 'pg';
import { isEmail, readJson, send } from './http.js';
import { TERMS_VERSION, createAccountDataApi, recordTerms } from './account-data.js';
import { LIMITS, clientAddress, createRateLimiter, createSharedLimiter, limitClassFor, safely } from './guard.js';
import { createDashboardHandler, createTradeHandler } from './dashboard.js';
import { createPlanHandler } from './plan.js';
import { createWorkspaceApi } from './workspace.js';
import { groupHandler } from './group-api.js';
import { createCalendarHandlers } from './calendar.js';
import { createOnboardingHandler } from './onboarding.js';
import { createNotificationApi, notify } from './notifications.js';
import { createNotificationSettingsApi } from './notification-settings.js';
import { configureDelivery, createSenders, flushPending } from './notification-delivery.js';
import { getMessaging } from 'firebase-admin/messaging';
import { createTicketApi } from './support-tickets.js';
import { createStreakStore } from './streak-store.js';
import { createStreakApi } from './streak-api.js';
import { runStreakMaintenance } from './streak-maintenance.js';
import { prepareWelcome, readMailConfig, startWelcomeDelivery } from './welcome-email.js';

const projectId = process.env.FIREBASE_PROJECT_ID;
const connectionString = process.env.DATABASE_URL;
if (!projectId || !connectionString) {
  throw new Error('Set FIREBASE_PROJECT_ID and DATABASE_URL in backend/.env.local.');
}

const firebaseApp = initializeApp({ projectId });
const auth = getAuth(firebaseApp);
const appCheckGate = createAppCheckGate(firebaseApp);
const pool = new pg.Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  // A stuck query must not hold a connection (and a request) forever.
  statement_timeout: 15_000,
  idle_in_transaction_session_timeout: 30_000,
});
pool.on('error', () => console.error('An idle database connection failed.'));
const mailConfig = readMailConfig(process.env);
startMentorMail(pool,mailConfig);
startBillingMail(pool,mailConfig);
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

// Which accounts have two-step sign-in on. Remembered briefly so ordinary requests do not each query the database.
const twoStepCache = new Map();
const twoStepEnabled = async (uid) => {
  const hit = twoStepCache.get(uid);
  if (hit && hit.until > Date.now()) return hit.enabled;
  const enabled = await createTwoStepStore(async (sql, params) => (await pool.query(sql, params)).rows).enabled(uid);
  if (twoStepCache.size > 5000) twoStepCache.clear();
  twoStepCache.set(uid, { enabled, until: Date.now() + 15_000 });
  return enabled;
};
export const forgetTwoStep = (uid) => twoStepCache.delete(uid);

async function authenticateRequest(request, response, { skipSecondStep = false } = {}) {
  const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) {
    send(response, 401, { error: 'Sign in to continue.' });
    return;
  }
  let claims;
  try {
    // Changes and data downloads also check that the sign-in was not revoked or its account deleted.
    // Plain reads skip that extra Firebase round trip to stay fast.
    const sensitive = !['GET', 'HEAD'].includes(request.method) || (request.url ?? '').startsWith('/api/account/export');
    claims = await auth.verifyIdToken(token, sensitive);
  } catch {
    send(response, 401, { error: 'Sign in again to continue.' });
    return;
  }
  if (claims.email_verified !== true) {
    send(response, 403, { error: 'Verify your email address to continue.' });
    return;
  }
  // Accounts that turned on two-step sign-in need the code entered for this sign-in before anything else.
  claims.mfa = false;
  if (process.env.FIELD_ENCRYPTION_KEY && await twoStepEnabled(claims.uid)) {
    if (checkSession(request.headers['x-mfa-session'], claims.uid, claims.auth_time)) claims.mfa = true;
    else if (!skipSecondStep) {
      send(response, 401, { error: 'Enter your two-step code to continue.', mfaRequired: true });
      return;
    }
  }
  return claims;
}

async function loadAccount(request, response) {
  const claims = await authenticateRequest(request, response);
  if (!claims) return;
  const { uid } = claims;
  // Sign-up sends which terms version was ticked; the server records it with its own clock.
  if (request.headers['content-type']) {
    const { data } = await readJson(request, 1024);
    if (data?.terms === TERMS_VERSION) await recordTerms(pool, uid, data.terms).catch(() => console.error('Could not record the terms acceptance.'));
  }
  const find = `SELECT a.created_at AS "createdAt", p.display_name AS "displayName",
    p.onboarded_at IS NOT NULL AS "onboardingCompleted", encode(p.profile_picture,'base64') AS avatar FROM ledgerline_accounts a
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

// A visitor can open a ticket; if they are signed in the ticket is linked to their account.
const identify = async (request) => {
  const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return null;
  try {
    const claims = await auth.verifyIdToken(token);
    return claims.email_verified === true && claims.email ? claims : null;
  } catch { return null; }
};
const tickets = createTicketApi(pool, mailConfig, { authenticate: authenticateRequest, identify, auth, notify: (uid, kind, details) => notify(pool, uid, kind, details).catch(() => null) });
const notifications = createNotificationApi(pool, authenticateRequest);
const notificationSettings = createNotificationSettingsApi(pool, authenticateRequest);
configureDelivery(createSenders({ pool, mail: mailConfig, messaging: getMessaging(firebaseApp) }));
const accountData = createAccountDataApi(pool, authenticateRequest, auth);
const twoStepRaw = createTwoStepApi(pool, authenticateRequest);
const twoStep = Object.fromEntries(Object.entries(twoStepRaw).map(([name, handler]) => [name, async (request, response) => { await handler(request, response); twoStepCache.clear(); }]));
const calendar = createCalendarHandlers(pool, authenticateRequest);
const streaks = createStreakStore(pool);
const streak = createStreakApi(pool, authenticateRequest, streaks, { remindersAvailable: Boolean(mailConfig) });
const saveTrade = createTradeHandler(streaks, authenticateRequest);
const workspace = createWorkspaceApi(pool, authenticateRequest);
const reports=reportApi(pool,authenticateRequest);
const billing=billingApi(pool,authenticateRequest);
const routes = new Map([
  ...['overview','invoice','manage'].map(key=>['/api/billing/'+key,{methods:[key==='manage'?'POST':'GET'],handler:billing}]),
  ['/api/billing/profile',{methods:['GET','PUT'],handler:billingProfile(pool,authenticateRequest)}],
  ['/api/billing/checkout',{methods:['POST','GET'],handler:billing}],
  ['/api/billing/status',{methods:['GET'],handler:billing}],
  ['/api/billing/crypto/webhook',{methods:['POST'],handler:billing}],
  ['/api/billing/webhook',{methods:['POST'],handler:billing}],
  ['/api/reports',{methods:['GET'],handler:reports}],
  ['/api/ai/report',{methods:['POST','DELETE'],handler:reports}],
  ['/api/reports/preferences',{methods:['GET','PUT'],handler:reports}],
  ['/api/group-link',{methods:['GET'],handler:async(req,res)=>{
    if(!await authenticateRequest(req,res))return;
    const id=new URL(req.url,'http://localhost').searchParams.get('id');
    try {
      const {rows}=await pool.query('SELECT kind FROM community_before_split.backup_clubs WHERE id::text=$1',[id]);
      send(res,200,{destination:rows.length?(rows[0].kind==='space'?'/spaces/':'/clubs/')+id:'/clubs'});
    }catch{send(res,503,{error:'Group link unavailable.'});}
  }}],
  ['/api/mentor-verification',{methods:['GET','POST'],handler:mentorVerification(pool,authenticateRequest,auth)}],
  ['/api/mentor-review',{methods:['GET','POST'],handler:mentorVerification(pool,authenticateRequest,auth,true)}],
  ['/api/clubs', {methods:['GET','POST'],handler:groupHandler(pool,authenticateRequest,'club')}],
  ['/api/spaces', {methods:['GET','POST'],handler:groupHandler(pool,authenticateRequest,'space')}],
  ['/api/account', { methods: ['PUT', 'DELETE'], handler: (request, response) => (request.method === 'DELETE' ? accountData.remove : loadAccount)(request, response) }],
  ['/api/mfa/status', { methods: ['GET'], handler: (request, response) => twoStep.status(request, response) }],
  ['/api/mfa/setup', { methods: ['POST'], handler: (request, response) => twoStep.setup(request, response) }],
  ['/api/mfa/enable', { methods: ['POST'], handler: (request, response) => twoStep.enable(request, response) }],
  ['/api/mfa/verify', { methods: ['POST'], handler: (request, response) => twoStep.verify(request, response) }],
  ['/api/mfa/disable', { methods: ['POST'], handler: (request, response) => twoStep.disable(request, response) }],
  ['/api/account/export', { methods: ['GET'], handler: (request, response) => accountData.export(request, response) }],
  ['/api/newsletter', { methods: ['POST'], handler: subscribe }],
  ['/api/support', { methods: ['POST'], handler: tickets.create }],
  ['/api/notifications', { methods: ['GET', 'POST'], handler: notifications.main }],
  ['/api/notification-settings', { methods: ['GET', 'PUT'], handler: notificationSettings.main }],
  ['/api/notification-settings/push', { methods: ['POST', 'DELETE'], handler: notificationSettings.push }],
  ['/api/notifications/count', { methods: ['GET'], handler: notifications.count }],
  ['/api/notifications/stream', { methods: ['GET'], handler: notifications.stream }],
  ['/api/tickets', { methods: ['GET', 'POST'], handler: tickets.mine }],
  ['/api/ticket-admin', { methods: ['GET', 'POST'], handler: tickets.admin }],
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
  ['/api/profile-picture', {methods:['PUT'], handler:createProfilePictureHandler(pool,authenticateRequest)}],
  ['/api/streak/badges', { methods: ['GET','PUT'], handler: (req,res) => (req.method==='PUT'?streak.badgeVisibility:streak.badgeShelf)(req,res) }],
  ['/api/streak/badges/seen', { methods: ['POST'], handler: streak.badgesSeen }],
  ['/api/streak/share', { methods: ['GET', 'POST'], handler: (request, response) =>
    (request.method === 'GET' ? streak.shared : streak.share)(request, response) }],
  ['/api/streak/preferences', { methods: ['GET', 'PUT'], handler: (request, response) =>
    (request.method === 'GET' ? streak.preferences : streak.savePreferences)(request, response) }],
]);

const sharedStore = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
const limiters = Object.fromEntries(Object.entries(LIMITS).map(([name, options]) => {
  const local = createRateLimiter(options);
  return [name, sharedStore
    ? createSharedLimiter({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, ...options, fallback: local })
    : local];
}));
configureErrorReport();

async function health(request, response) {
  try {
    await pool.query('SELECT 1');
    send(response, 200, { status: 'ok' });
  } catch {
    send(response, 503, { status: 'database unavailable' });
  }
}
routes.set('/api/health', { methods: ['GET'], handler: health });

const server = createServer(async (request, response) => {
  const url = request.url ?? '/';
  const pathname = url.split('?', 1)[0];
  const route = routes.get(pathname);
  if (!route) {
    send(response, 404, { error: 'Route not found.' });
    return;
  }
  if (!route.methods.includes(request.method)) {
    response.setHeader('Allow', route.methods.join(', '));
    send(response, 405, { error: 'Method not available for this route.' });
    return;
  }
  if (pathname !== '/api/health') {
    const cls = limitClassFor(pathname, request.method);
    const verdict = await limiters[cls](cls + ':' + pathname + ':' + clientAddress(request));
    if (!verdict.allowed) {
      response.setHeader('Retry-After', String(verdict.retryAfter));
      send(response, 429, { error: 'Too many requests. Try again in ' + verdict.retryAfter + ' seconds.' });
      return;
    }
  }
  if (!(await appCheckGate(request, response, pathname))) return;
  void safely(route.handler)(request, response);
});
// Slow or half-open connections must not pile up.
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

const port = Number(process.env.PORT ?? 8787);
server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log('Ledgerline account API listening on port ' + port);
});

if (process.env.STREAK_NEON_SCHEDULE !== 'true') {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try { await flushPending(pool); } catch { console.error('Held notifications could not be sent.'); }
    try { await runStreakMaintenance(pool, mailConfig); }
    catch (error) { console.error('Streak maintenance failed (' + (error.code ?? 'unknown') + ').'); }
    finally { running = false; }
  }, 5 * 60_000).unref();
}

// A background failure should be logged, not take the whole API down with a raw stack trace.
process.on('unhandledRejection', (reason) => { reportError(reason, 'rejection'); console.error('An unhandled promise rejection occurred (' + (reason?.code ?? reason?.name ?? 'unknown') + ').'); });
process.on('uncaughtException', (error) => {
  reportError(error, 'exception');
  console.error('An uncaught exception occurred (' + (error?.code ?? error?.name ?? 'unknown') + '). Shutting down.');
  shutdown(1);
});

// Finish in-flight requests and release database connections on deploy or restart.
let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  setTimeout(() => process.exit(code || 1), 10_000).unref();
  server.close(() => pool.end().finally(() => process.exit(code)));
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
