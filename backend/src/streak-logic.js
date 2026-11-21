const dayMs = 86_400_000;
const dateFormatters = new Map();
const priority = { rest: 1, review: 2, trade: 3 };

export function localDay(instant, timezone) {
  if (!dateFormatters.has(timezone)) {
    dateFormatters.set(timezone, new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' }));
  }
  return dateFormatters.get(timezone).format(new Date(instant));
}

export function shiftDay(day, offset) {
  return new Date(Date.parse(day) + offset * dayMs).toISOString().slice(0, 10);
}

export function mondayOf(day) {
  return shiftDay(day, -((new Date(day).getUTCDay() + 6) % 7));
}

export function normalizeTradeTime(value, now = new Date()) {
  if (value === undefined) return now.toISOString();
  const match = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  const time = match ? Date.parse(value) : NaN;
  if (!Number.isFinite(time) || shiftDay(match[1], 0) !== match[1] || +now - time > 2 * dayMs || time > +now) {
    throw new RangeError('Choose a trade time within the last 48 hours.');
  }
  return new Date(time).toISOString();
}

export function calculateStreak({ today, activity, isClosed = () => false }) {
  const actual = new Map();
  for (const item of activity) {
    if (item.day > today) continue;
    const day = actual.get(item.day) ?? { kind: item.kind, reviews: 0, checks: 0, kept: 0 };
    if (priority[item.kind] > priority[day.kind]) day.kind = item.kind;
    day.reviews += item.reviews ?? 0;
    day.checks += item.checks ?? 0;
    day.kept += item.kept ?? 0;
    actual.set(item.day, day);
  }

  const days = [];
  let current = 0;
  let best = 0;
  let freezes = 1;
  let xp = 0;
  let perfectRun = 0;
  let perfectBest = 0;
  let lastKind;
  const first = [...actual.keys()].sort()[0];
  for (let day = first; day && day <= today; day = shiftDay(day, 1)) {
    const entries = actual.get(day);
    let kind = entries?.kind;
    if (!kind && day === today) break;
    if (!kind && current && isClosed(day)) kind = 'rest';
    if (!kind && current && lastKind !== 'freeze' && freezes) {
      kind = 'freeze';
      freezes--;
    }
    if (!kind) {
      current = 0;
      perfectRun = 0;
      lastKind = undefined;
      continue;
    }
    days.push({ day, kind });
    current++;
    best = Math.max(best, current);
    lastKind = kind;
    if (current % 7 === 0) freezes = Math.min(2, freezes + 1);
    xp += 10 + 5 * (entries?.reviews ?? 0);
    if (entries?.checks) {
      if (entries.checks === entries.kept) {
        xp += 20;
        perfectRun++;
        perfectBest = Math.max(perfectBest, perfectRun);
      } else {
        perfectRun = 0;
      }
    }
  }
  const monday = mondayOf(today);
  const counted = new Map(days.map(({ day, kind }) => [day, kind]));
  const kindToday = counted.get(today) ?? null;
  const todayActivity = actual.get(today);
  return {
    current, best, daysToBest: best - current, freezes, level: Math.floor(xp / 100) + 1, xp,
    week: Array.from({ length: 7 }, (_, index) => counted.has(shiftDay(monday, index))),
    weekReasons: Array.from({ length: 7 }, (_, index) => {
      const day = shiftDay(monday, index);
      return actual.get(day)?.kind ?? (counted.get(day) === 'rest' ? 'marketClosed' : counted.get(day)) ?? null;
    }),
    marketClosedToday: !todayActivity && Boolean(current) && isClosed(today),
    todayCounted: Boolean(kindToday), nextFreezeIn: 7 - current % 7,
    todayIndex: (new Date(today).getUTCDay() + 6) % 7,
    kindToday, skippedToday: Boolean(todayActivity && todayActivity.kept < todayActivity.checks),
    manualRestToday: activity.some(({ day, kind }) => day === today && kind === 'rest'),
    lastCountedDay: days.at(-1)?.day ?? null, days, perfectBest,
  };
}

export function scoreBattle(days, start, length) {
  const counted = new Set(days);
  let current = 0;
  let best = 0;
  for (let offset = 0; offset < length; offset++) {
    current = counted.has(shiftDay(start, offset)) ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}
