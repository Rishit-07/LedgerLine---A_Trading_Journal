const dayInIndia = date => new Date(+new Date(date) + 330 * 60000).toISOString().slice(0,10);
const unavailable = reason => ({candles:[], candleStatus:reason});

export function createCandleLookup({token=process.env.UPSTOX_HISTORY_TOKEN, fetcher=fetch, now=Date.now}={}) {
  const cache=new Map();
  async function load({symbol,market,openedAt,closedAt}) {
    if(!token) return unavailable('Historical market data is not connected.');
    const prefix=/^(NSE|BSE):(.+)$/.exec(symbol);
    const exchange=prefix?.[1] ?? 'NSE';
    const ticker=prefix?.[2] ?? symbol;
    const types={stocks:'EQ',options:'CE,PE',futures:'FUT'};
    if(!types[market])return unavailable('This market is outside the connected feed.');
    const start=+new Date(openedAt), end=+new Date(closedAt);
    const duration=end-start;
    if(!(duration>=0) || duration>89*86400000) return unavailable('This holding period is outside the intraday replay window.');
    const minutes=[1,5,15,30,60,300].find(m=>duration/(60000*m)<=490) ?? 300;
    const signal=AbortSignal.timeout(7500);
    async function get(path) {
      const response=await fetcher('https://api.upstox.com/'+path,{signal,headers:{Accept:'application/json',Authorization:'Bearer '+token}});
      if(!response.ok)throw new Error('Historical feed unavailable');
      const json=await response.json();
      if(json.status!=='success')throw new Error('Historical feed unavailable');
      return json.data;
    }
    const query=new URLSearchParams({query:ticker,exchanges:exchange,segments:market==='stocks'?'EQ':'FO',records:'30'});
    const matches=(await get('v2/instruments/search?'+query)).filter(item=>item.exchange===exchange && item.trading_symbol===ticker &&
      (market==='stocks' ? item.segment===exchange+'_EQ' : types[market].split(',').includes(item.instrument_type)));
    if(matches.length!==1)return unavailable('No exact '+exchange+' contract matched this trade.');
    const path=encodeURIComponent(matches[0].instrument_key)+'/minutes/'+minutes;
    const today=dayInIndia(now()), first=dayInIndia(start),last=dayInIndia(end);
    const calls=[];
    if(first<today) calls.push(get('v3/historical-candle/'+path+'/'+(last===today?dayInIndia(now()-86400000):last)+'/'+first));
    if(last===today) calls.push(get('v3/historical-candle/intraday/'+path));
    const candles=new Map();
    for(const response of await Promise.all(calls)) for(const [at,open,high,low,close] of response.candles ?? []) {
      const time=Date.parse(at);
      if(!(time>=start-minutes*60000 && time+minutes*60000<=end && [open,high,low,close].every(n=>Number.isFinite(n)&&n>0) &&
        high>=Math.max(open,low,close) && low<=Math.min(open,close)))continue;
      candles.set(time,{at:new Date(time).toISOString(),open,high,low,close});
    }
    if(!candles.size)return unavailable('No completed market candles were available in this trading window.');
    return {candles:[...candles].sort(([a],[b])=>a-b).map(([,c])=>c),candleSource:'Upstox · '+exchange+' · '+minutes+' min'};
  }
  return async trade=>{
    if(!token)return unavailable('Historical market data is not connected.');
    const key=JSON.stringify([trade.market,trade.symbol,trade.openedAt,trade.closedAt]);
    const entry=cache.get(key);
    if(entry && entry.expires>now())return entry.result;
    if(cache.size>=256)cache.delete(cache.keys().next().value);
    const result=load(trade).catch(()=>unavailable('Historical data is temporarily unavailable.'));
    cache.set(key,{result,expires:now()+60000});
    return result;
  };
}
