import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStreak, localDay, normalizeTradeTime, scoreBattle, shiftDay } from '../src/streak-logic.js';

const trade = (day, extra = {}) => ({ day, kind: 'trade', ...extra });

test('a new account has no streak, best, or XP even when its markets are closed', () => {
  const state = calculateStreak({ today: '2026-11-22', activity: [], isClosed: () => true });
  assert.deepEqual([state.current, state.best, state.xp, state.level, state.freezes], [0, 0, 0, 1, 1]);
  assert.equal(state.todayCounted, false);
});

test('the local day boundary is independent of UTC and can be rebuilt in a new timezone', () => {
  const prior = '2026-11-20T18:29:00Z';
  const next = '2026-11-20T18:31:00Z';
  assert.equal(localDay(prior, 'Asia/Kolkata'), '2026-11-20');
  assert.equal(localDay(next, 'Asia/Kolkata'), '2026-11-21');
  assert.equal(localDay(next, 'UTC'), '2026-11-20');
});

test('backfill uses elapsed hours, accepts exactly 48 hours, and rejects future or ambiguous inputs', () => {
  const now = new Date('2026-11-22T10:00:00Z');
  assert.equal(normalizeTradeTime('2026-11-20T15:30:00+05:30', now), '2026-11-20T10:00:00.000Z');
  for (const value of ['2026-11-20T09:59:59Z', '2026-11-22T10:00:01Z', '2026-11-22', '2026-11-22T08:00:00', '2026-11-31T08:00:00Z']) {
    assert.throws(() => normalizeTradeTime(value, now));
  }
});

test('yesterday keeps the streak alive; one past missed day can be frozen', () => {
  const activity = [trade('2026-11-18')];
  assert.equal(calculateStreak({ today: '2026-11-19', activity }).current, 1);
  const state = calculateStreak({ today: '2026-11-20', activity });
  assert.equal(state.current, 2);
  assert.equal(state.todayCounted, false);
  assert.equal(state.days.at(-1).kind, 'freeze');
  assert.equal(state.freezes, 0);
});

test('two stored freezes cover separate misses, never two consecutive missed days', () => {
  const activity = Array.from({ length: 7 }, (_, i) => trade(shiftDay('2026-11-01', i)));
  const earned = calculateStreak({ today: '2026-11-07', activity });
  assert.equal(earned.freezes, 2);
  const separate = calculateStreak({ today: '2026-11-12', activity: [...activity, trade('2026-11-09'), trade('2026-11-11')] });
  assert.deepEqual([separate.current, separate.freezes], [11, 0]);
  const chained = calculateStreak({ today: '2026-11-11', activity });
  assert.equal(chained.current, 0);
  assert.equal(chained.freezes, 1);
  assert.equal(chained.days.filter((day) => day.kind === 'freeze').length, 1);
});

test('automatic closures continue an existing run while manual rest and review can start one', () => {
  const { days, current } = calculateStreak({ today: '2026-11-22',
    activity: [trade('2026-11-20'), { day: '2026-11-22', kind: 'review', reviews: 1 }],
    isClosed: (day) => day >= '2026-11-21',
  });
  assert.deepEqual(days.map(({ kind }) => kind), ['trade', 'rest', 'review']);
  assert.equal(current, 3);
  assert.equal(calculateStreak({ today: '2026-11-22', activity: [{ day: '2026-11-22', kind: 'rest' }] }).current, 1);
});

test('XP counts each date once, awards every distinct review, and ignores profitability', () => {
  const activity = [
    trade('2026-11-20', { checks: 3, kept: 3, profit: -500 }),
    { day: '2026-11-20', kind: 'review', reviews: 2 },
    { day: '2026-11-20', kind: 'rest' },
    trade('2026-11-21', { checks: 2, kept: 1, profit: 900 }),
  ];
  const state = calculateStreak({ today: '2026-11-21', activity });
  assert.equal(state.xp, 50);
  assert.equal(state.current, 2);
  assert.equal(state.perfectBest, 1);
  assert.equal(state.kindToday, 'trade');
  assert.equal(state.skippedToday, true);
  assert.deepEqual(state.week, [false, false, false, false, true, true, false]);
});

test('removing the only entry removes its day and recalculates the best and XP', () => {
  const before = calculateStreak({ today: '2026-11-20', activity: [trade('2026-11-20')] });
  const after = calculateStreak({ today: '2026-11-20', activity: [] });
  assert.equal(before.current, 1);
  assert.deepEqual([after.current, after.best, after.xp, after.days.length], [0, 0, 0, 0]);
});

test('battle scoring measures the longest streak inside a fixed window and allows ties', () => {
  const days = ['2026-11-10', '2026-11-11', '2026-11-13', '2026-11-14', '2026-11-15'];
  assert.equal(scoreBattle(days, '2026-11-11', 3), 1);
  assert.equal(scoreBattle(days, '2026-11-11', 5), 3);
  assert.equal(scoreBattle([], '2026-11-11', 5), 0);
});
