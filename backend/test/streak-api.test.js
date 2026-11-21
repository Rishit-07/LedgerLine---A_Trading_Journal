import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import pg from 'pg';
import { createDashboardHandler, createTradeHandler } from '../src/dashboard.js';
import { createPlanHandler } from '../src/plan.js';
import { createCalendarHandlers } from '../src/calendar.js';
import { createStreakApi } from '../src/streak-api.js';
import { createStreakStore } from '../src/streak-store.js';

async function call(handler, uid, { url = '/', body, email } = {}) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  request.url = url;
  request.method = body === undefined ? 'GET' : 'PUT';
  request.uid = uid;
  request.email = email;
  request.headers = { 'content-type': 'application/json' };
  const response = {
    writeHead(status) { this.status = status; },
    end(payload) { this.body = JSON.parse(payload); },
  };
  await handler(request, response);
  return response;
}

test('streak API protects the session before accessing the store', async () => {
  const api = createStreakApi(null, (request, response) => {
    response.writeHead(401);
    response.end('{}');
  }, {});
  assert.equal((await call(api.status, null)).status, 401);
});

test('streak API applies the rules to real Postgres queries under a rolled-back transaction', {
  skip: !process.env.STREAK_TEST_DATABASE_URL,
}, async () => {
  const db = new pg.Client({ connectionString: process.env.STREAK_TEST_DATABASE_URL, connectionTimeoutMillis: 5000 });
  await db.connect();
  try {
    await db.query('BEGIN');
    const ids = Array.from({ length: 3 }, () => 'streak-test-' + randomUUID());
    const [alice, bob, outsider] = ids;
    await db.query('INSERT INTO ledgerline_accounts (firebase_uid) SELECT unnest($1::text[])', [ids]);
    await db.query(`
      INSERT INTO user_profile (user_id, display_name, markets, onboarded_at, streak_exchanges)
      SELECT id, name, ARRAY['stocks']::text[], now(), '{}'::text[]
      FROM unnest($1::text[], ARRAY['Alice','Bob','Outsider']) AS users(id,name)
    `, [ids]);
    const pool = {
      query: (...args) => db.query(...args),
      connect: async () => ({
        release() {},
        query: (sql, values) => db.query(
          { BEGIN: 'SAVEPOINT request', COMMIT: 'RELEASE SAVEPOINT request', ROLLBACK: 'ROLLBACK TO SAVEPOINT request' }[sql] ?? sql, values,
        ),
      }),
    };
    let now = new Date('2026-11-20T18:31:00Z');
    const authenticate = async (request) => ({ uid: request.uid, email: request.email });
    const store = createStreakStore(pool, () => now);
    const api = createStreakApi(pool, authenticate, store, { remindersAvailable: true });
    const createTrade = createTradeHandler(store, authenticate);
    const dashboard = createDashboardHandler(pool, authenticate);
    const plan = createPlanHandler(pool, authenticate);
    const initialDashboard = await call(dashboard, alice);
    assert.equal(initialDashboard.body.traderScore.value, null);
    assert.equal((await call(plan, alice)).body.plan, null);
    const draft = { action: 'save', bias: 'Bullish', levels: 'Previous high', notes: 'Wait for retest' };
    assert.deepEqual((await call(plan, alice, { body: draft })).body.plan,
      { bias: 'Bullish', levels: { watched: draft.levels, notes: draft.notes }, locked: false });
    assert.equal((await call(plan, bob)).body.plan, null);
    assert.equal((await call(plan, alice, { body: { ...draft, action: 'lock' } })).body.plan.locked, true);
    assert.equal((await call(plan, alice, { body: draft })).status, 409);
    assert.equal((await call(plan, alice, { body: { action: 'unlock' } })).body.plan.locked, false);
    assert.deepEqual((await call(dashboard, alice)).body.plan, { bias: 'Bullish', locked: false });
    const calendar = createCalendarHandlers(pool, authenticate);
    const hours = await call(calendar.day, alice, { url: '/?view=market&date=' + initialDashboard.body.day });
    assert.equal(hours.status, 200);
    if (initialDashboard.body.day.startsWith('2026') && !process.env.UPSTOX_CALENDAR_TOKEN) {
      assert.equal(hours.body.marketHours.status, 'published');
    }
    const empty = await call(api.status, alice);
    assert.deepEqual([empty.status, empty.body.current, empty.body.best], [200, 0, 0]);
    const template = { requestId: randomUUID(), symbol: 'NIFTY', market: 'stocks', side: 'long', result: -1,
      entry: 100, stop: null, target: null, kept: [], occurredAt: '2026-11-20T18:29:00Z' };
    const previous = await call(createTrade, alice, { body: template });
    assert.equal(previous.status, 200);
    assert.equal(previous.body.streak.todayCounted, false);
    const savedScore = (await call(dashboard, alice)).body.traderScore;
    assert.ok(Number.isInteger(savedScore.value) && savedScore.value >= 0 && savedScore.value <= 100);
    assert.equal(savedScore.components.find((component) => component.label === 'Forecast calibration').value, null);
    const rebucket = await call(api.savePreferences, alice, { body: { timezone: 'UTC', exchanges: [], reminderTime: null } });
    assert.equal(rebucket.body.todayCounted, true);
    await call(api.savePreferences, alice, { body: { timezone: 'Asia/Kolkata', exchanges: [], reminderTime: null } });
    const expired = await call(createTrade, alice, { body: { ...template, requestId: randomUUID(), occurredAt: '2026-11-17T18:29:00Z' } });
    assert.equal(expired.status, 400);
    const journal = await call(api.journal, alice);
    const tradeId = journal.body.trades[0].id;
    assert.equal(journal.body.trades[0].entry, 100);
    assert.deepEqual((await call(api.journal, outsider, { url: '/?tradeId=' + tradeId })).body.trades, []);
    const tradingDay = await call(calendar.day, alice, { url: '/?date=2026-11-20' });
    assert.deepEqual(tradingDay.body.trades.map(({id,entry,result})=>[id,entry,result]), [[tradeId,100,-1]]);
    assert.deepEqual((await call(calendar.day, outsider, { url: '/?date=2026-11-20' })).body.trades, []);
    const month = await call(calendar.month, alice, { url: '/?month=2026-11' });
    assert.deepEqual([month.status,month.body.tradeCount,month.body.netR], [200,1,-1]);
    const wrongUser = await call(api.review, outsider, { body: { tradeId } });
    assert.equal(wrongUser.status, 404);
    const reviewed = await call(api.review, alice, { body: { tradeId } });
    assert.deepEqual([reviewed.body.current, reviewed.body.xp], [2, 25]);
    assert.equal((await call(api.inboxReview, bob, { body: { tradeId, setup:'Pullback', mood:'Calm' } })).status, 404);
    assert.equal((await call(api.inboxReview, alice, { body: { tradeId, setup:'Pullback', mood:'Calm' } })).status, 200);
    const inboxTrade = (await call(api.journal, alice)).body.trades[0];
    assert.deepEqual([inboxTrade.setup, inboxTrade.mood, inboxTrade.reviewed], ['Pullback','Calm',true]);
    assert.equal((await call(api.review, alice, { body: { tradeId } })).body.xp, 25);
    assert.equal((await call(api.remove, bob, { url: '/?tradeId=' + tradeId })).status, 404);
    assert.equal((await call(api.remove, alice, { url: '/?tradeId=' + tradeId })).body.current, 0);
    const rest = await call(api.rest, alice, { body: { note: 'Waited for a setup.' } });
    assert.equal(rest.body.kindToday, 'rest');
    assert.equal((await call(createDashboardHandler(pool, authenticate), alice)).body.streak, 1);
    await call(api.rest, alice, { body: {} });
    assert.deepEqual((await call(api.journal, alice)).body.restDays, [{ day: '2026-11-21', note: 'Waited for a setup.' }]);
    assert.deepEqual((await call(calendar.month, alice, { url: '/?month=2026-11' })).body.restDays, ['2026-11-21']);
    const share = await call(api.share, alice, { body: { theme: 'indigo', current: 999 } });
    assert.equal(share.status, 200);
    const shared = await call(api.shared, null, { url: '/?token=' + share.body.token });
    assert.deepEqual([shared.status, shared.body.current, shared.body.theme], [200, 1, 'indigo']);
    assert.equal(Object.hasOwn(shared.body, 'userId'), false);
    assert.equal((await call(api.shared, null, { url: '/?token=invalid' })).status, 404);
    const bobStatus = await call(api.status, bob);
    const bobCode = bobStatus.body.inviteCode;
    const preview = await call(api.invitePreview, null, { url: '/?code=' + bobCode });
    assert.deepEqual([preview.status, preview.body], [200, { name: 'Bob' }]);
    assert.equal((await call(api.invitePreview, null, { url: '/?code=' + randomUUID() })).status, 404);
    assert.equal((await call(api.invitePreview, null, { url: '/?code=invalid' })).status, 404);
    const sent = await call(api.invite, alice, { body: { code: bobCode } });
    assert.equal(sent.status, 200);
    const relation = (await call(api.friends, bob)).body.friends[0];
    assert.equal(sent.body.id, relation.id);
    assert.deepEqual([relation.name, relation.status, relation.outgoing], ['Alice', 'pending', false]);
    assert.equal((await call(api.accept, alice, { body: { id: relation.id } })).status, 404);
    assert.equal((await call(api.accept, bob, { body: { id: relation.id } })).status, 200);
    assert.equal((await call(api.challenge, outsider, { body: { friendId: relation.id, lengthDays: 7 } })).status, 409);
    assert.equal((await call(api.challenge, alice, { body: { friendId: relation.id, lengthDays: 7 } })).status, 200);
    assert.equal((await call(api.battles, bob)).body.battles[0].name, 'Alice');
    assert.deepEqual((await call(api.battles, outsider)).body.battles, []);
    assert.equal((await call(api.savePreferences, alice, {
      body: { timezone: 'UTC', exchanges: [], reminderTime: '20:00' }, email: 'streak-test@example.invalid',
    })).status, 200);
    assert.equal((await call(api.preferences, alice)).body.reminderTime, '20:00');
    now = new Date('2026-12-01T18:31:00Z');
    await db.query("UPDATE streak_battles SET started_on='2026-11-21',length_days=3 WHERE challenger_id=$1", [alice]);
    assert.equal((await call(api.battles, alice)).body.battles[0].result, 'won');
    assert.equal((await call(api.battles, bob)).body.battles[0].result, 'lost');
    await call(api.status, alice);
    for (let offset = 1; offset <= 7; offset++) {
      now = new Date(Date.UTC(2026, 11, offset, 10));
      await call(api.rest, outsider, { body: {} });
    }
    const badges = (await call(api.status, outsider)).body.badges;
    assert.ok(badges.some((badge) => badge.key === 'streak-7' && badge.seen === false));
    await call(api.badgesSeen, outsider, { body: { key: 'streak-7' } });
    assert.equal((await call(api.status, outsider)).body.badges.find((badge) => badge.key === 'streak-7').seen, true);
    now = new Date('2026-12-24T10:00:00Z');
    await call(api.savePreferences, bob, { body: { timezone: 'Asia/Kolkata', exchanges: ['NSE', 'BSE'], reminderTime: null } });
    await call(api.rest, bob, { body: {} });
    now = new Date('2026-12-25T10:00:00Z');
    const holiday = (await call(api.status, bob)).body;
    assert.deepEqual([holiday.current, holiday.kindToday, holiday.todayCounted,holiday.marketClosedToday], [1, null, false,true]);
    now = new Date('2026-12-26T10:00:00Z');
    const saturday=(await call(api.status,bob)).body;
    assert.equal(saturday.current,2);
    assert.equal(saturday.weekReasons[4],'marketClosed');
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
});
