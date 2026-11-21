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

function officialNews(url, source, country) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return cachedSource(async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(6_000), redirect: 'error' });
    if (!response.ok) throw new Error('News feed unavailable');
    const xml = await response.text();
    if (!/<rss\b/i.test(xml)) throw new Error('Unexpected news feed');
    const read = (item, tag) => (item.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'i'))?.[1] ?? '')
      .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
      .replace(/&(amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi, (entity, key) => {
        if (key[0] !== '#') return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[key.toLowerCase()];
        const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
        return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
      }).trim();
    return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, 100).flatMap(([, item]) => {
      const title = read(item, 'title');
      const at = time(read(item, 'pubDate'));
      const article = read(item, 'link');
      const link = article ? URL.parse(article, url) : null;
      if (!title || !at || link?.protocol !== 'https:' || link.hostname.replace(/^www\./, '') !== host) return [];
      return [{ title, at, url: link.href, source, country, kind: 'news' }];
    });
  });
}

const rbiNews = officialNews('https://www.rbi.org.in/pressreleases_rss.xml', 'Reserve Bank of India', 'India');
const fedNews = officialNews('https://www.federalreserve.gov/feeds/press_monetary.xml', 'Federal Reserve', 'United States');

const notConfigured = () => ({ status: 'not-configured', data: [] });

async function publishedHolidays(pool, first, last) {
  const { rows } = await pool.query(`
    SELECT day::text AS date, closed, exchange, opens_at::text AS opens, closes_at::text AS closes
    FROM exchange_holidays WHERE day BETWEEN $1 AND $2 ORDER BY day, exchange
  `, [first, last]);
  return rows;
}

const sessionTime = (day, at) => new Date(day + 'T' + at + '+05:30').toISOString();

function publishedSession(day, { exchange, opens = '09:15', closes = '15:30' }) {
  return { exchange: exchange + ' equities', opensAt: sessionTime(day, opens), closesAt: sessionTime(day, closes) };
}

async function publishedHours(pool, day) {
  const { rows } = await pool.query(`
    SELECT exchange, bool_or(day=$1::date) AS exception, bool_or(closed) FILTER (WHERE day=$1::date) AS closed,
      (max(opens_at) FILTER (WHERE day=$1::date))::text AS opens,
      (max(closes_at) FILTER (WHERE day=$1::date))::text AS closes
    FROM exchange_holidays
    WHERE day >= date_trunc('year',$1::date) AND day < date_trunc('year',$1::date) + interval '1 year'
    GROUP BY exchange
  `, [day]);
  if (!rows.length) return null;
  const weekday = new Date(day).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  const data = rows.flatMap((entry) => {
    if (entry.exception) return !entry.closed && entry.opens && entry.closes ? [publishedSession(day, entry)] : [];
    return weekend ? [] : [publishedSession(day, { exchange: entry.exchange })];
  });
  return { status: 'published', data, specialHoursUnlisted: rows.some((entry) => entry.exception && !entry.closed &&
    (!entry.opens || !entry.closes)) };
}

function selectedMarkets(query) {
  const markets=query.getAll('market');
  return markets.length ? markets : null;
}

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
      const query = new URL(request.url, 'http://localhost').searchParams;
      const month = query.get('month');
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
            WHERE t.user_id = $1 AND ($3::text[] IS NULL OR t.market=ANY($3)) AND t.closed_at >= b.start_time AND t.closed_at < b.end_time
          ),
          exits AS (
            SELECT day::text AS date, count(*)::int AS count, sum(result)::float AS result,
              (count(*) FILTER (WHERE result > 0))::int AS wins, sum(checks) AS checks, sum(kept) AS kept
            FROM closed GROUP BY day
          ), entries AS (
            SELECT (opened_at AT TIME ZONE 'Asia/Kolkata')::date::text AS date, count(*)::int AS opened
            FROM trades CROSS JOIN bounds WHERE user_id=$1 AND ($3::text[] IS NULL OR market=ANY($3)) AND opened_at>=start_time AND opened_at<end_time GROUP BY 1
          ), daily AS (
            SELECT date, coalesce(count,0) AS count, coalesce(opened,0) AS opened, result,wins,checks,kept
            FROM exits FULL JOIN entries USING(date)
          )
          SELECT coalesce((SELECT json_agg(daily ORDER BY date) FROM daily), '[]') AS days,
            ARRAY(SELECT DISTINCT date::text FROM journal_entries
              WHERE user_id=$1 AND is_rest_day AND date >= $2::date AND date < $2::date + interval '1 month') AS "restDays",
            (SELECT count(*)::int FROM daily) AS "tradingDays",
            (SELECT symbol FROM closed GROUP BY symbol ORDER BY count(*) DESC, symbol LIMIT 1) AS "mostTraded",
            count(*)::int AS "tradeCount", sum(result)::float AS "netR", avg(result)::float AS "averageR",
            (count(*) FILTER (WHERE result > 0) * 100.0 / nullif(count(*), 0))::float AS "winRate",
            (sum(kept) * 100.0 / nullif(sum(checks), 0))::float AS adherence
          FROM closed
        `, [claims.uid, first, selectedMarkets(query)]);
        if (query.get('includeNews') === '1' && summary.tradeCount && month === today().slice(0, 7)) {
          const economicFeed = await economic(today());
          const releases = (economicFeed.status === 'live' ? economicFeed : await bea()).data;
          const times = releases.filter((event)=>event.impact===3 && event.at).map(({at})=>at);
          if (times.length) {
            const { rows: [news] } = await pool.query(`
              SELECT avg(t.r_multiple)::float AS average, count(*)::int AS samples
              FROM trades t WHERE t.user_id=$1 AND t.closed_at IS NOT NULL
                AND (t.closed_at AT TIME ZONE 'Asia/Kolkata')::date >= $2::date
                AND (t.closed_at AT TIME ZONE 'Asia/Kolkata')::date < $2::date + interval '1 month'
                AND ($4::text[] IS NULL OR t.market=ANY($4))
                  AND EXISTS (SELECT 1 FROM unnest($3::timestamptz[]) AS event(at)
                  WHERE t.opened_at BETWEEN event.at - interval '30 minutes' AND event.at + interval '30 minutes')
            `, [claims.uid, first, times, selectedMarkets(query)]);
            summary.newsWindow = news;
          }
        }
        send(response, 200, summary);
      } catch (error) {
        console.error('Could not load the trading month (' + (error.code ?? 'unknown error') + ').');
        send(response, 503, { error: 'This trading month is temporarily unavailable.' });
      }
    },
    calendar: async (request, response) => {
      if (!await authenticate(request, response)) return;
      const day = today();
      const [primary, earningsFeed, dividendFeed, catalystFeed, holidayFeed, expiryFeed, fallback, rbi, fed] = await Promise.all([
        economic(day), earnings(day), dividends(day), catalysts(day), holidays(), expiries(), bea(), rbiNews(), fedNews(),
      ]);
      const publicFeed = primary.status === 'live' ? { status: 'standby', data: [] } : fallback;
      const first = shift(day, -34);
      const last = shift(day, 14);
      const exchangeFeed = holidayFeed.status === 'live' ? holidayFeed : await publishedHolidays(pool, first, last)
        .then((records) => records.length ? { status: 'published', data: records.map((record) => ({
          date: record.date, kind: 'holiday', title: record.exchange + (record.closed ? ' trading holiday' : ' special session'),
          source: record.exchange + ' published calendar',
          sessions: !record.closed && record.opens && record.closes ? [publishedSession(record.date, record)] : [],
        })) } : holidayFeed).catch(() => holidayFeed);
      const feeds = { economic: primary, bea: publicFeed, earnings: earningsFeed, dividends: dividendFeed, catalysts: catalystFeed, holidays: exchangeFeed, expiries: expiryFeed, rbi, fed };
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
        let data;
        if (market) {
          const brokerHours = await hours(day);
          const marketHours = brokerHours.status === 'live' ? brokerHours : await publishedHours(pool, day) ?? brokerHours;
          data = { marketHours };
        } else data = await loadJournal(pool, claims.uid, day, selectedMarkets(query));
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

async function loadJournal(pool, uid, day, markets) {
  const [trades, notes] = await Promise.all([
    pool.query(`
      WITH session_day AS (
        SELECT $2::date::timestamp AT TIME ZONE 'Asia/Kolkata' AS start_time,
          ($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata' AS end_time
      )
      SELECT t.id::text, t.symbol, t.market, t.side, t.setup, t.qty::float, t.entry::float, t.exit::float,
        t.stop::float, t.target::float, t.r_multiple::float AS result,
        (SELECT count(*)::int FROM trade_checks c WHERE c.user_id=t.user_id AND c.trade_id=t.id AND NOT c.kept) AS breaks,
        t.opened_at AS "openedAt", t.closed_at AS "closedAt"
      FROM trades t CROSS JOIN session_day d WHERE t.user_id = $1 AND ($3::text[] IS NULL OR t.market=ANY($3)) AND (
        (t.opened_at >= d.start_time AND t.opened_at < d.end_time) OR
        (t.closed_at >= d.start_time AND t.closed_at < d.end_time)
      )
      ORDER BY coalesce(t.closed_at, t.opened_at) DESC, t.id DESC
    `, [uid, day, markets]),
    pool.query(`
      SELECT j.note, j.mood, j.tags, j.is_rest_day AS "isRestDay", t.symbol FROM journal_entries j
      LEFT JOIN trades t ON t.user_id = j.user_id AND t.id = j.trade_id
      WHERE j.user_id = $1 AND j.date = $2::date AND (j.trade_id IS NULL OR $3::text[] IS NULL OR t.market=ANY($3)) ORDER BY j.id
    `, [uid, day, markets]),
  ]);
  return { trades: trades.rows, notes: notes.rows };
}
