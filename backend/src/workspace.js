import {createCandleLookup} from './replay-candles.js';
import { configuredCoach, askCoach, checkCoachScope } from './coach.js';
import { communityApi } from './community.js';
import { readJson, send } from './http.js';

const tradeId = /^[1-9]\d{0,17}$/;
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const today = "(now() AT TIME ZONE 'Asia/Kolkata')::date";
const string = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim());
const numeric = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const profile = `SELECT display_name AS "displayName", markets, risk_per_trade_pct::float AS "riskPerTrade",
  daily_loss_limit_r AS "dailyLossLimit", max_trades_per_day AS "maxTrades",
  coalesce(s.current,0) AS streak, coalesce(s.best,0) AS best, coalesce(s.level,1) AS level
  FROM user_profile p LEFT JOIN streak_state s ON s.user_id=p.user_id WHERE p.user_id=$1 AND p.onboarded_at IS NOT NULL`;

const trades = `SELECT t.id::text, t.symbol, t.market, t.side, t.setup, t.opened_at AS "openedAt",
  t.closed_at AS "closedAt", t.r_multiple::float AS result, t.entry::float, t.exit::float, t.stop::float, t.target::float,
  t.reviewed_at IS NOT NULL AS reviewed, checks.total AS checks, checks.kept,
  coalesce(j.note,'') AS note
  FROM trades t LEFT JOIN LATERAL (
    SELECT count(*)::int AS total, count(*) FILTER (WHERE kept)::int AS kept
    FROM trade_checks WHERE user_id=$1 AND trade_id=t.id
  ) checks ON true LEFT JOIN LATERAL (
    SELECT note FROM journal_entries WHERE user_id=$1 AND trade_id=t.id AND btrim(note)<>'' ORDER BY id DESC LIMIT 1
  ) j ON true WHERE t.user_id=$1 ORDER BY t.opened_at DESC, t.id DESC LIMIT 501`;

const portfolioFields = 'slug::text, headline, display_name AS "displayName", about, design, sections, visibility';
const portfolioStats = `SELECT (SELECT count(*)::int FROM trades WHERE user_id=$1 AND reviewed_at IS NOT NULL) AS reviews,
  (SELECT round(100.0 * count(*) FILTER (WHERE kept) / nullif(count(*),0))::int FROM trade_checks WHERE user_id=$1) AS adherence`;
const fail = (status, message) => Object.assign(new Error(message), { status });
const requireValue = (valid, message) => { if (!valid) throw fail(400, message); };

function validateCandles(candles) {
  if (!Array.isArray(candles) || !candles.length || candles.length > 500) return false;
  let previous = -Infinity;
  for (const row of candles) {
    if (!row || !Number.isFinite(Date.parse(row.at)) || +new Date(row.at) <= previous ||
      ![row.open,row.high,row.low,row.close].every((value) => numeric(value, 0.00000001, 1e12)) ||
      row.high < Math.max(row.open,row.close,row.low) || row.low > Math.min(row.open,row.close)) return false;
    previous = +new Date(row.at);
  }
  return true;
}

export function createWorkspaceApi(pool, authenticate, {coachConfig = configuredCoach(process.env), fetchCoach = fetch, lookupCandles = createCandleLookup()} = {}) {
  const query = async (sql, params) => (await pool.query(sql, params)).rows;
  const coaching = new Set();
  const allowance = 20000;
  async function coachBalance(uid) {
    const [wallet]=await query('SELECT spent FROM coach_daily_tokens WHERE user_id=$1 AND day='+today,[uid]);
    return {remaining:Math.max(0,allowance-(wallet?.spent ?? 0)),allowance};
  }
  const community = communityApi(query);
  const pageLoaders = {
    history: async (uid) => {
      const ledger = await query(trades, [uid]);
      return { trades: ledger.slice(0, 500), hasOlder: ledger.length > 500 };
    },
    replay: async (uid) => ({ trades: (await query(trades, [uid])).filter(({ closedAt }) => closedAt).slice(0, 500) }),
    mistake: async (uid) => ({
      trades: (await query(trades, [uid])).slice(0, 500),
      mistakes: await query(`SELECT trade_id::text AS "tradeId", kind, note, created_at AS "createdAt"
        FROM mistakes WHERE user_id=$1 ORDER BY created_at DESC LIMIT 500`, [uid]),
    }),
    sizing: async (uid) => ({ preset: (await query('SELECT settings FROM sizing_presets WHERE user_id=$1', [uid]))[0]?.settings ?? null }),
    forecast: async (uid) => ({ instruments:await query(
      'SELECT t.symbol,max(t.opened_at) AS last_used FROM trades t JOIN user_profile p USING(user_id) WHERE t.user_id=$1 AND t.market=ANY(p.markets) GROUP BY t.symbol ORDER BY last_used DESC LIMIT 100',[uid]), forecasts: await query(`SELECT id::text, symbol, direction, category, probability, thesis,
      due_on::text AS "dueOn", resolved_at AS "resolvedAt", outcome FROM forecasts WHERE user_id=$1 ORDER BY id DESC LIMIT 500`, [uid]) }),
    reports: async (uid) => ({ trades: (await query(trades, [uid])).slice(0, 500) }),
    portfolio: async (uid) => ({
      portfolio: (await query('SELECT '+portfolioFields+' FROM portfolios WHERE user_id=$1', [uid]))[0] ?? null,
      stats: (await query(portfolioStats, [uid]))[0],
    }),
    people: community.people,
    clubs: (uid) => community.groups(uid,'club'),
    spaces: (uid) => community.groups(uid,'space'),
    coach: async (uid) => ({
      tokens:await coachBalance(uid),
      available:Boolean(coachConfig),provider:coachConfig?.provider,
      chats: await query('SELECT id,title,pinned,updated_at AS "updatedAt" FROM coach_chats WHERE user_id=$1 ORDER BY pinned DESC,updated_at DESC,id',[uid]),
    }),
    plan: async (uid) => ({
      rules: await query('SELECT text, hard FROM rules WHERE user_id=$1 AND active ORDER BY position', [uid]),
      trades: (await query(trades,[uid])).filter(({closedAt})=>closedAt).slice(0,100),
    }),
    calendar: async () => ({}),
  };

  const writes = {
    history: async (uid, data) => {
      requireValue(data.action === 'close' && tradeId.test(data.tradeId), 'Choose an open trade.');
      requireValue(numeric(data.result,-10000,10000) && (data.exit == null || numeric(data.exit,0.00000001,1e12)), 'Enter a valid result in R and an optional exit price.');
      const [closed] = await query(`UPDATE trades SET closed_at=now(),exit=$3,r_multiple=$4
        WHERE user_id=$1 AND id=$2 AND closed_at IS NULL RETURNING id::text,closed_at AS "closedAt"`,
        [uid,data.tradeId,data.exit ?? null,data.result]);
      if (!closed) throw fail(409,'This position is already closed or unavailable. Refresh your trades.');
      return closed;
    },
    replay: async (uid, data) => {
      if (data.action === 'rule') {
        requireValue(tradeId.test(data.tradeId ?? '') && string(data.lesson,1000,true),'Write a lesson before creating a rule.');
        const [rule] = await query(`INSERT INTO rules (user_id,rule_key,text,hard,position)
          SELECT user_id,'replay:'||id::text,$3,false,least(32767,1+coalesce((SELECT max(position) FROM rules WHERE user_id=$1),-1))
          FROM trades WHERE user_id=$1 AND id=$2 AND closed_at IS NOT NULL
          ON CONFLICT (user_id,rule_key) DO UPDATE SET text=excluded.text,active=true RETURNING id::text`,
        [uid,data.tradeId,data.lesson.trim()]);
        if (!rule) throw fail(404,'Closed trade unavailable.');
        return {rule};
      }
      requireValue(tradeId.test(data.tradeId ?? '') && (data.candles === undefined || validateCandles(data.candles)) &&
        (data.lesson === undefined || string(data.lesson, 1000)) && (data.candles !== undefined || data.lesson !== undefined),
      'Choose a closed trade and enter valid candles or a lesson.');
      const [record] = await query(`WITH replay AS (
        INSERT INTO trade_replays (user_id,trade_id,candles,lesson)
        SELECT user_id,id,coalesce($3::jsonb,'[]'::jsonb),coalesce($4,'') FROM trades WHERE user_id=$1 AND id=$2 AND closed_at IS NOT NULL
        ON CONFLICT (user_id,trade_id) DO UPDATE SET candles=coalesce($3::jsonb,trade_replays.candles),lesson=coalesce($4,trade_replays.lesson)
        RETURNING candles, lesson, user_id, trade_id
      ), journal AS (
        INSERT INTO journal_entries (user_id,trade_id,date,note,tags)
        SELECT user_id,trade_id,${today},lesson,ARRAY['replay'] FROM replay WHERE $4 <> ''
        ON CONFLICT (user_id,trade_id) WHERE tags @> ARRAY['replay']::text[] DO UPDATE SET note=excluded.note
      ) SELECT candles,lesson FROM replay`, [uid, data.tradeId, data.candles === undefined ? null : JSON.stringify(data.candles), data.lesson?.trim() ?? null]);
      if (!record) throw fail(404, 'Closed trade unavailable.');
      return record;
    },
    mistake: async (uid, data) => {
      requireValue(tradeId.test(data.tradeId ?? '') && string(data.kind, 50, true) && string(data.note, 500),
        'Choose a trade and enter a mistake to log.');
      const [record] = await query(`INSERT INTO mistakes (user_id,trade_id,kind,note)
        SELECT user_id,id,$3,$4 FROM trades WHERE user_id=$1 AND id=$2 AND closed_at IS NOT NULL
        ON CONFLICT (user_id,trade_id,kind) DO UPDATE SET note=excluded.note
        RETURNING trade_id::text AS "tradeId",kind,note,created_at AS "createdAt"`, [uid, data.tradeId, data.kind.trim(), data.note.trim()]);
      if (!record) throw fail(404, 'Closed trade unavailable.');
      return record;
    },
    sizing: async (uid, data) => {
      const { win, payoff, risk, events, needed, fraction = .25 } = data;
      requireValue(numeric(win,0,100) && numeric(payoff,0.01,100) && numeric(risk,0.01,25) && [.25,.5,1].includes(fraction) &&
        Number.isInteger(events) && numeric(events,1,30) && Number.isInteger(needed) && numeric(needed,1,events), 'Check your sizing inputs.');
      const preset = { win, payoff, risk, events, needed, fraction };
      await query(`INSERT INTO sizing_presets (user_id,settings) VALUES ($1,$2)
        ON CONFLICT (user_id) DO UPDATE SET settings=excluded.settings`, [uid, preset]);
      return { preset };
    },
    forecast: async (uid, data) => {
      if (data.action === 'resolve') {
        requireValue(tradeId.test(data.id ?? '') && typeof data.outcome === 'boolean', 'Choose a forecast and an outcome.');
        const [resolved] = await query(`UPDATE forecasts SET outcome=$3,resolved_at=now()
          WHERE user_id=$1 AND id=$2 AND resolved_at IS NULL AND due_on<=${today} RETURNING id`, [uid, data.id, data.outcome]);
        if (!resolved) throw fail(409, 'This forecast can be resolved on or after its review date.');
        return { ok: true };
      }
      const validDate = typeof data.dueOn === 'string' && isoDay.test(data.dueOn) &&
        Number.isFinite(Date.parse(data.dueOn)) && new Date(data.dueOn).toISOString().slice(0,10) === data.dueOn && data.dueOn >= '2000-01-01';
      requireValue(string(data.symbol,48,true) && string(data.thesis,1500,true) && ['up','down','flat'].includes(data.direction) &&
        ['Macro','Earnings','Technical'].includes(data.category) && Number.isInteger(data.probability) && numeric(data.probability,1,99) && validDate,
      'Enter a thesis, probability, and future review date.');
      const [created] = await query(`INSERT INTO forecasts (user_id,symbol,direction,category,probability,thesis,due_on)
        SELECT $1,$2,$3,$4,$5,$6,$7::date WHERE $7::date>${today} RETURNING id`,
      [uid,data.symbol.trim().toUpperCase(),data.direction,data.category,data.probability,data.thesis.trim(),data.dueOn]);
      if (!created) throw fail(400, 'Choose a future review date.');
      return { ok: true };
    },
    portfolio: async (uid, data) => {
      requireValue(string(data.headline,120) && string(data.displayName,100) && string(data.about,1000) &&
        ['dashboard','marginalia','terracotta'].includes(data.design) &&
        ['private','link','public'].includes(data.visibility) && ['streak','adherence','reviews'].every((key) => typeof data.sections?.[key] === 'boolean'),
      'Choose valid portfolio settings.');
      const sections = Object.fromEntries(['streak','adherence','reviews'].map((key) => [key,data.sections[key]]));
      const [portfolio] = await query(`INSERT INTO portfolios (user_id,headline,design,sections,visibility,display_name,about)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id) DO UPDATE SET headline=excluded.headline,design=excluded.design,
          sections=excluded.sections,visibility=excluded.visibility,display_name=excluded.display_name,about=excluded.about
        RETURNING ${portfolioFields}`, [uid,data.headline.trim(),data.design,sections,data.visibility,data.displayName.trim(),data.about.trim()]);
      return { portfolio };
    },
    clubs: (uid,data) => community.change(uid,'club',data),
    spaces: (uid,data) => community.change(uid,'space',data),
    coach: async (uid,data) => {
      requireValue(typeof data.chatId === 'string' && uuid.test(data.chatId),'Choose a valid conversation.');
      if (data.action !== undefined) {
        const params = [uid, data.chatId];
        let sql;
        if (data.action === 'rename') {
          requireValue(string(data.title,80,true),'Enter a chat name of up to 80 characters.');
          params.push(data.title.trim());
          sql = 'UPDATE coach_chats SET title=$3';
        } else if (data.action === 'pin') {
          requireValue(typeof data.pinned === 'boolean','Choose a valid pin setting.');
          params.push(data.pinned);
          sql = 'UPDATE coach_chats SET pinned=$3';
        } else if (data.action === 'delete') {
          sql = 'DELETE FROM coach_chats';
        } else throw fail(400,'Unknown chat action.');
        const [chat] = await query(sql+' WHERE user_id=$1 AND id=$2 RETURNING id,title,pinned,updated_at AS "updatedAt"',params);
        if (!chat) throw fail(404,'Conversation unavailable.');
        return chat;
      }
      if (!coachConfig) throw fail(503,'AI chat is not connected.');
      requireValue(string(data.question,600,true),'Enter a question of up to 600 characters.');
      if (coaching.has(uid)) throw fail(429,'Your last question is still being answered.');
      coaching.add(uid);
      try {
        if (!(await coachBalance(uid)).remaining) throw fail(429,'Your Coach tokens refill at midnight IST.');
        const usage={tokens:0};
        const [existing] = await query('SELECT id FROM coach_chats WHERE user_id=$1 AND id=$2',[uid,data.chatId]);
        if (!existing && data.newChat !== true) throw fail(404,'Conversation unavailable.');
        const history = await query('SELECT question,answer,sources FROM coach_messages WHERE user_id=$1 AND chat_id=$2 ORDER BY id DESC LIMIT 4',[uid,data.chatId]);
        history.reverse();
        await checkCoachScope(coachConfig,data.question,history,fetchCoach,usage);
        const [latest,rules,limits,plans,mistakes,streak] = await Promise.all([
          query(trades.replace('LIMIT 501','LIMIT 25'),[uid]),
          query('SELECT text,hard FROM rules WHERE user_id=$1 AND active ORDER BY position LIMIT 30',[uid]),
          query('SELECT markets,risk_per_trade_pct AS "riskPercent",daily_loss_limit_r AS "dailyLossLimitR",max_trades_per_day AS "dailyTradeLimit" FROM user_profile WHERE user_id=$1',[uid]),
          query('SELECT date::text,bias,locked_at IS NOT NULL AS committed FROM plans WHERE user_id=$1 ORDER BY date DESC LIMIT 5',[uid]),
          query('SELECT kind,count(*)::int AS occurrences FROM mistakes WHERE user_id=$1 GROUP BY kind ORDER BY occurrences DESC,kind LIMIT 8',[uid]),
          query('SELECT current,best,level FROM streak_state WHERE user_id=$1',[uid]),
        ]);
        const results = latest.map(({ openedAt, closedAt, symbol, market, side, setup, result, checks, kept, reviewed },index) =>
          ({ reference:index+1, openedAt, closedAt, symbol, market, side, setup, result, checks, kept, reviewed }));
        const answer=await askCoach(coachConfig,data.question.trim(),results,history,fetchCoach,{rules,limits:limits[0],plans,mistakes,streak:streak[0]},usage);
        const sources=results.map(({reference,openedAt},index)=>({reference,openedAt,tradeId:latest[index].id}));
        const question = data.question.trim();
        const title = Array.from(question.replace(/\s+/g,' ')).slice(0,64).join('');
        const [record] = await query(`WITH chat AS (
          ${existing ? 'UPDATE coach_chats SET updated_at=now() WHERE user_id=$1 AND id=$2 AND $3::text IS NOT NULL'
            : 'INSERT INTO coach_chats (user_id,id,title) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING'}
          RETURNING id,title,pinned,updated_at
        ), message AS (
          INSERT INTO coach_messages (user_id,chat_id,question,answer,sources)
          SELECT $1,id,$4,$5,$6 FROM chat RETURNING id,created_at,question,answer,sources
        ), usage AS (INSERT INTO coach_requests(user_id, created_at, legacy_message_id) SELECT $1,created_at,id FROM message)
        SELECT chat.id,chat.title,chat.pinned,chat.updated_at AS "updatedAt",message.question,message.answer,message.sources,
          debit_coach_tokens($1,$7,$8) AS remaining
        FROM chat CROSS JOIN message`,
        [uid,data.chatId,title,question,answer,JSON.stringify(sources),usage.tokens,allowance]);
        if (!record) throw fail(409,'This conversation changed. Reopen it and try again.');
        return record;
      } finally { coaching.delete(uid); }
    },
  };

  return {
    workspace: async (request, response) => {
      const claims = await authenticate(request, response);
      if (!claims) return;
      const params = new URL(request.url, 'http://localhost').searchParams;
      const page = params.get('page');
      if (!Object.hasOwn(pageLoaders,page)) return send(response,404,{ error:'Workspace page unavailable.' });
      try {
        if (request.method === 'POST') {
          if (!Object.hasOwn(writes,page)) return send(response,405,{ error:'This page does not accept changes.' });
          const { error,data } = await readJson(request,120_000);
          if (error || !data || typeof data !== 'object' || Array.isArray(data)) return send(response,error ?? 400,{ error:'Check the form details.' });
          return send(response,200,await writes[page](claims.uid,data));
        }
        if (page === 'coach' && params.has('chatId')) {
          const chatId = params.get('chatId');
          requireValue(uuid.test(chatId),'Choose a valid conversation.');
          const [chat] = await query('SELECT id FROM coach_chats WHERE user_id=$1 AND id=$2',[claims.uid,chatId]);
          if (!chat) throw fail(404,'Conversation unavailable.');
          const messages = await query('SELECT question,answer,sources FROM coach_messages WHERE user_id=$1 AND chat_id=$2 ORDER BY id',[claims.uid,chatId]);
          return send(response,200,{ messages });
        }
        if (page === 'replay' && params.has('tradeId')) {
          const id = params.get('tradeId');
          requireValue(tradeId.test(id),'Choose a valid trade.');
          const [record] = await query(`SELECT t.symbol,t.market,t.opened_at AS "openedAt",t.closed_at AS "closedAt",coalesce(r.candles,'[]'::jsonb) AS candles, coalesce(r.lesson,'') AS lesson,
            coalesce((SELECT json_agg(json_build_object('text',rules.text,'kept',c.kept) ORDER BY rules.position)
            FROM trade_checks c JOIN rules ON rules.user_id=c.user_id AND rules.id=c.rule_id WHERE c.user_id=$1 AND c.trade_id=$2),'[]') AS rules
            FROM trades t LEFT JOIN trade_replays r ON r.user_id=t.user_id AND r.trade_id=t.id
            WHERE t.user_id=$1 AND t.id=$2 AND t.closed_at IS NOT NULL`, [claims.uid,id]);
          if (!record) throw fail(404,'Closed trade unavailable.');
          if(!record.candles.length) Object.assign(record,await lookupCandles(record));
          else record.candleSource='Imported candles';
          return send(response,200,record);
        }
        const [account] = await query(profile,[claims.uid]);
        if (!account) throw fail(409,'Finish onboarding first.');
        return send(response,200,{ account,today:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',dateStyle:'short'}).format(new Date()),
          ...await pageLoaders[page](claims.uid) });
      } catch (error) {
        if (error.code==='P4201') return send(response,429,{error:'Your Coach tokens refill at midnight IST.'});
        if (error.status) return send(response,error.status,{error:error.message});
        console.error('Workspace request failed (' + (error.code ?? 'unknown') + ').');
        return send(response,503,{error:'This workspace is temporarily unavailable.'});
      }
    },
    publicPortfolio: async (request,response) => {
      const slug = new URL(request.url,'http://localhost').searchParams.get('slug');
      if (!uuid.test(slug ?? '')) return send(response,404,{error:'Portfolio unavailable.'});
      try {
        const [record] = await query(`SELECT w.user_id, w.headline,w.about,w.design,w.sections,w.visibility,
          coalesce(nullif(w.display_name,''),p.display_name) AS "displayName",
          coalesce(s.current,0) AS streak,coalesce(s.best,0) AS best,coalesce(s.level,1) AS level
          FROM portfolios w JOIN user_profile p ON p.user_id=w.user_id
          LEFT JOIN streak_state s ON s.user_id=w.user_id WHERE w.slug=$1 AND w.visibility<>'private'`,[slug]);
        if (!record) return send(response,404,{error:'Portfolio unavailable.'});
        const { user_id, sections, streak, best, level, ...identity } = record;
        const [stats] = await query(portfolioStats,[user_id]);
        return send(response,200,{...identity,sections,stats:{
          ...(sections.streak ? {streak,best,level} : {}),
          ...(sections.adherence ? {adherence:stats.adherence} : {}),
          ...(sections.reviews ? {reviews:stats.reviews} : {}),
        }});
      } catch { return send(response,503,{error:'Portfolio temporarily unavailable.'}); }
    },
  };
}
