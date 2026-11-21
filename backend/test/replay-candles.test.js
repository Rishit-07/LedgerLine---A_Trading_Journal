import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandleLookup} from '../src/replay-candles.js';
const trade={symbol:'ABC',market:'stocks',openedAt:'2026-01-12T04:00:00Z',closedAt:'2026-01-12T04:15:00Z'};
test('missing entitlement uses journal events without contacting a feed',async()=>{
  const lookup=createCandleLookup({token:'',fetcher:()=>assert.fail('Unexpected network request')});
  assert.deepEqual((await lookup(trade)).candles,[]);
});
test('historical bars are exact-match, chronological, bounded and deduplicated',async()=>{
  let calls=0;
  const lookup=createCandleLookup({token:'test',now:()=>Date.parse('2026-01-13T04:00:00Z'),fetcher:async(url,options)=>{
    calls++;assert.equal(options.headers.Authorization,'Bearer test');
    if(url.includes('/search?'))return Response.json({status:'success',data:[{exchange:'NSE',trading_symbol:'ABC',segment:'NSE_EQ',instrument_key:'NSE_EQ|123'}]});
    assert.match(url,/NSE_EQ%7C123\/minutes\/1\/2026-01-12\/2026-01-12/);
    const rows=['04:15','04:03','04:00','04:03','03:55'].map(t=>['2026-01-12T'+t+':00Z',10,12,9,11,20]);
    return Response.json({status:'success',data:{candles:rows}});
  }});
  const [first,again]=await Promise.all([lookup(trade),lookup(trade)]);
  assert.deepEqual(first,again);assert.equal(calls,2);assert.equal(first.candles.length,2);
  assert.equal(first.candles[0].at,'2026-01-12T04:00:00.000Z');
});
test('ambiguous symbols and upstream errors retain an execution replay',async()=>{
  for(const response of [Response.json({status:'success',data:[]}),new Response(null,{status:429})]){
    const get=createCandleLookup({token:'test',fetcher:async()=>response});
    const result=await get(trade);assert.equal(result.candles.length,0);assert.ok(result.candleStatus);
  }
});
