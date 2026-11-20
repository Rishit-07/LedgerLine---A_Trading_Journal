import { send } from './http.js';

const minute = 60_000;
const dateKey = /^\d{4}-\d{2}-\d{2}$/;
const ist = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', dateStyle: 'short' });
const shift = (day, count) => new Date(Date.parse(day) + count * 86_400_000).toISOString().slice(0, 10);
const validDay = (day) => dateKey.test(day) && Number.isFinite(Date.parse(day)) && shift(day, 0) === day;
const today = () => ist.format(new Date());

async function getJson(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(6_000), redirect: 'error' });
  if (!response.ok) throw new Error('Calendar source returned ' + response.status);
  return response.json();
}

function rows(payload) {
  if (!Array.isArray(payload)) throw new Error('Unexpected calendar response');
  return payload;
}

function cachedSource(load, ttl = 5 * minute) {
  const cache = new Map();
  return (key = '') => {
    const previous = cache.get(key);
    if (previous?.pending || previous?.expires > Date.now()) return previous.value;
    const entry = { pending: true, expires: 0 };
    entry.value = Promise.resolve().then(() => load(key)).then((data) => {
      entry.pending = false;
      entry.expires = Date.now() + ttl;
      return { status: 'live', updatedAt: new Date().toISOString(), data };
    }, () => {
      entry.pending = false;
      entry.expires = Date.now() + minute;
      return { status: 'unavailable', data: [] };
    });
    for (const [date, saved] of cache) {
      if (!saved.pending && saved.expires <= Date.now()) cache.delete(date);
    }
    cache.set(key, entry);
    return entry.value;
  };
}

function time(value) {
  if (value == null || value === '') return null;
  const instant = new Date(value);
  return Number.isFinite(+instant) ? instant.toISOString() : null;
}

const bea = cachedSource(async () => {
  const payload = await getJson('https://apps.bea.gov/API/signup/release_dates.json');
  if (!Array.isArray(payload?.['Gross Domestic Product']?.release_dates)) throw new Error('Unexpected BEA response');
  const events = new Map();
  for (const [title, release] of Object.entries(payload)) {
    for (const value of release?.release_dates ?? []) {
      const at = time(value);
      if (!at) continue;
      const impact = /^(Gross Domestic Product|Personal Income and Outlays)$/.test(title) ? 3 : null;
      events.set(title + at, { title, at, country: 'United States', impact, source: 'U.S. BEA', kind: 'economic' });
    }
  }
  return [...events.values()];
}, 30 * minute);

const notConfigured = () => ({ status: 'not-configured', data: [] });

export function createCalendarHandlers(pool, authenticate) {
  const economicKey = process.env.TRADING_ECONOMICS_KEY;
  const corporateKey = process.env.FMP_CALENDAR_KEY;
  const catalystSymbols = (process.env.FMP_CATALYST_SYMBOLS ?? '').split(',').map((value) => value.trim())
    .filter((value) => /^[A-Z0-9.-]{1,20}$/.test(value)).slice(0, 30);
  const upstoxToken = process.env.UPSTOX_CALENDAR_TOKEN;
  const expirySymbols = (process.env.UPSTOX_EXPIRY_SYMBOLS ?? '').split(',').map((value) => value.trim()).filter(Boolean).slice(0, 8);
  const broker = async (path) => {
    const payload = await getJson('https://api.upstox.com/v2/' + path, { Authorization: 'Bearer ' + upstoxToken });
    if (payload.status !== 'success') throw new Error('Unexpected broker response');
    return rows(payload.data);
  };
  const economic = !economicKey ? notConfigured : cachedSource(async (day) => {
    const query = new URLSearchParams({ c: economicKey, f: 'json' });
    const payload = await getJson('https://api.tradingeconomics.com/calendar/country/india,united%20states,euro%20area/' + shift(day, -35) + '/' + shift(day, 15) + '?' + query);
    return rows(payload).flatMap((event) => {
      const at = time(typeof event.Date === 'string' && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(event.Date) ? event.Date + 'Z' : event.Date);
      return at && event.Event ? [{
        kind: 'economic', title: event.Event, at, country: event.Country, impact: Number(event.Importance),
        forecast: event.Forecast, actual: event.Actual, source: 'Trading Economics',
      }] : [];
    });
  });
  const corporate = (endpoint, kind) => !corporateKey ? notConfigured : cachedSource(async (day) => {
    const query = new URLSearchParams({ apikey: corporateKey, from: shift(day, -34), to: shift(day, 14) });
    return rows(await getJson('https://financialmodelingprep.com/stable/' + endpoint + '?' + query))
      .filter((event) => validDay(event.date) && typeof event.symbol === 'string')
      .map((event) => ({
        kind, date: event.date, symbol: event.symbol, title: event.symbol + (kind === 'earnings' ? ' earnings' : ' ex-dividend'),
        actual: kind === 'earnings' && event.epsActual != null ? String(event.epsActual) : null,
        forecast: kind === 'earnings' && event.epsEstimated != null ? String(event.epsEstimated) : null,
        source: 'Financial Modeling Prep',
      }));
  }, 15 * minute);
  const earnings = corporate('earnings-calendar', 'earnings');
  const dividends = corporate('dividends-calendar', 'dividend');
  const catalysts = !corporateKey || !catalystSymbols.length ? notConfigured : cachedSource(async (day) => {
    const query = new URLSearchParams({ apikey: corporateKey, symbols: catalystSymbols.join(','), from: shift(day, -34), to: day, limit: '50' });
    return rows(await getJson('https://financialmodelingprep.com/stable/news/stock?' + query))
      .flatMap((event) => {
        const date = event.publishedDate?.slice(0, 10);
        return validDay(date) && event.title ? [{
          kind: 'catalyst', date, title: event.title, symbol: event.symbol, source: event.publisher || 'Financial Modeling Prep',
        }] : [];
      });
  }, 15 * minute);
  const holidays = !upstoxToken ? notConfigured : cachedSource(async () =>
    (await broker('market/holidays')).filter((item) => validDay(item.date)).map((item) => ({
      date: item.date, kind: 'holiday', title: item.description || 'Exchange schedule update',
      type: item.holiday_type, closed: Array.isArray(item.closed_exchanges) ? item.closed_exchanges : [],
      sessions: rows(item.open_exchanges ?? []).map(session), source: 'Upstox',
    })), 15 * minute);
  const hours = !upstoxToken ? notConfigured : cachedSource(async (day) =>
    (await broker('market/timings/' + day)).map(session).filter(({ opensAt, closesAt }) => opensAt && closesAt));
  const expiries = !upstoxToken || !expirySymbols.length ? notConfigured : cachedSource(async () => {
    const lists = await Promise.all(expirySymbols.map(async (symbol) => {
      const [options, futures] = await Promise.all([
        broker('option/contract?' + new URLSearchParams({ instrument_key: 'NSE_INDEX|' + symbol })),
        broker('instruments/search?' + new URLSearchParams({
          query: symbol, exchanges: 'NSE', segments: 'FO', instrument_types: 'FUT', expiry: 'current_month,next_month,far_month', records: '30',
        })),
      ]);
      const unique = new Map();
      for (const contract of options.concat(futures)) {
        if (!validDay(contract.expiry)) continue;
        const type = contract.instrument_type === 'FUT' ? 'Futures' : contract.weekly ? 'Weekly options' : 'Options';
        unique.set(contract.expiry + type, { date: contract.expiry, title: symbol + ' · ' + type + ' expiry', kind: 'expiry', source: 'Upstox' });
      }
      return [...unique.values()];
    }));
    return lists.flat();
  }, 15 * minute);

  return {
    month: async (request, response) => {
      const claims = await authenticate(request, response);
      if (!claims) return;
      const month = new URL(request.url, 'http://localhost').searchParams.get('month');
      const first = month + '-01';
      if (!validDay(first) || first < '0001-01-01' || first > today()) {
        return send(response, 400, { error: 'Choose a valid calendar month.' });
      }
      try {
        const { rows: [summary] } = await pool.query(`
          WITH bounds AS (
            SELECT $2::date::timestamp AT TIME ZONE 'Asia/Kolkata' AS start_time,
              ($2::date + interval '1 month') AT TIME ZONE 'Asia/Kolkata' AS end_time
          ),
          closed AS (
            SELECT (t.closed_at AT TIME ZONE 'Asia/Kolkata')::date AS day, t.symbol, t.r_multiple AS result,
              rules.checks, rules.kept
            FROM trades t CROSS JOIN bounds b
            CROSS JOIN LATERAL (
              SELECT count(*)::int AS checks, (count(*) FILTER (WHERE c.kept))::int AS kept
              FROM trade_checks c WHERE c.user_id = t.user_id AND c.trade_id = t.id
            ) rules
            WHERE t.user_id = $1 AND t.closed_at >= b.start_time AND t.closed_at < b.end_time
          ),
          daily AS (
            SELECT day::text AS date, count(*)::int AS count, sum(result)::float AS result,
              (count(*) FILTER (WHERE result > 0))::int AS wins, sum(checks) AS checks, sum(kept) AS kept
            FROM closed GROUP BY day
          )
          SELECT coalesce((SELECT json_agg(daily ORDER BY date) FROM daily), '[]') AS days,
            (SELECT count(*)::int FROM daily) AS "tradingDays",
            (SELECT symbol FROM closed GROUP BY symbol ORDER BY count(*) DESC, symbol LIMIT 1) AS "mostTraded",
            count(*)::int AS "tradeCount", sum(result)::float AS "netR", avg(result)::float AS "averageR",
            (count(*) FILTER (WHERE result > 0) * 100.0 / nullif(count(*), 0))::float AS "winRate",
            (sum(kept) * 100.0 / nullif(sum(checks), 0))::float AS adherence
          FROM closed
        `, [claims.uid, first]);
        send(response, 200, summary);
      } catch (error) {
        console.error('Could not load the trading month (' + (error.code ?? 'unknown error') + ').');
        send(response, 503, { error: 'This trading month is temporarily unavailable.' });
      }
    },
    calendar: async (request, response) => {
      if (!await authenticate(request, response)) return;
      const day = today();
      const [primary, earningsFeed, dividendFeed, catalystFeed, holidayFeed, expiryFeed, fallback] = await Promise.all([
        economic(day), earnings(day), dividends(day), catalysts(day), holidays(), expiries(), bea(),
      ]);
      const publicFeed = primary.status === 'live' ? { status: 'standby', data: [] } : fallback;
      const feeds = { economic: primary, bea: publicFeed, earnings: earningsFeed, dividends: dividendFeed, catalysts: catalystFeed, holidays: holidayFeed, expiries: expiryFeed };
      const first = shift(day, -34);
      const last = shift(day, 14);
      const events = Object.values(feeds).flatMap((feed) => feed.data).filter((event) => {
        const key = event.date ?? ist.format(new Date(event.at));
        return key >= first && key <= last;
      });
      send(response, 200, { first, last, events, sources: Object.fromEntries(
        Object.entries(feeds).map(([key, { status, updatedAt }]) => [key, { status, updatedAt }]),
      ) });
    },
    day: async (request, response) => {
      const claims = await authenticate(request, response);
      if (!claims) return;
      const query = new URL(request.url, 'http://localhost').searchParams;
      const day = query.get('date');
      const market = query.get('view') === 'market';
      const current = today();
      if (!validDay(day) || day < (market ? shift(current, -34) : '0001-01-01') || day > (market ? shift(current, 14) : current)) {
        return send(response, 400, { error: 'Choose a day in the calendar range.' });
      }
      try {
        const data = market ? { marketHours: await hours(day) } : await loadJournal(pool, claims.uid, day);
        send(response, 200, data);
      } catch (error) {
        console.error('Could not load the trading day (' + (error.code ?? 'unknown error') + ').');
        send(response, 503, { error: 'This trading day is temporarily unavailable.' });
      }
    },
  };
}

function session(item) {
  return { exchange: item.exchange, opensAt: time(item.start_time), closesAt: time(item.end_time) };
}

async function loadJournal(pool, uid, day) {
  const [trades, notes] = await Promise.all([
    pool.query(`
      WITH session_day AS (
        SELECT $2::date::timestamp AT TIME ZONE 'Asia/Kolkata' AS start_time,
          ($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata' AS end_time
      )
      SELECT t.id::text, t.symbol, t.market, t.side, t.setup, t.qty::float, t.entry::float, t.exit::float,
        t.stop::float, t.target::float, t.r_multiple::float AS result,
        t.opened_at AS "openedAt", t.closed_at AS "closedAt"
      FROM trades t CROSS JOIN session_day d WHERE t.user_id = $1 AND (
        (t.opened_at >= d.start_time AND t.opened_at < d.end_time) OR
        (t.closed_at >= d.start_time AND t.closed_at < d.end_time)
      )
      ORDER BY coalesce(t.closed_at, t.opened_at) DESC, t.id DESC
    `, [uid, day]),
    pool.query(`
      SELECT j.note, j.mood, j.tags, t.symbol FROM journal_entries j
      LEFT JOIN trades t ON t.user_id = j.user_id AND t.id = j.trade_id
      WHERE j.user_id = $1 AND j.date = $2::date ORDER BY j.id
    `, [uid, day]),
  ]);
  return { trades: trades.rows, notes: notes.rows };
}
