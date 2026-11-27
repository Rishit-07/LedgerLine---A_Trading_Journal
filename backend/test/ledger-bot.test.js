import test from 'node:test';
import assert from 'node:assert/strict';
import {noteFor} from '../src/ledger-bot.js';

const BANNED=/profit|loss|p&l|pnl|[$₹€£]|\btips?\b|predict|forecast|\bbuy\b|\bsell\b|\btarget\b/i;
test('notes come from process numbers only',()=>{
 assert.match(noteFor({streak:{current:5}}),/5 days in a row/);
 assert.match(noteFor({streak:{current:1},enough_data:true,rules_followed_pct:82.4}),/82%/);
 assert.match(noteFor({streak:{current:0},journal_days_30:7}),/7 of the last 30/);
 assert.match(noteFor({}),/process, not the result/);
 for(const s of [{streak:{current:9}},{enough_data:true,rules_followed_pct:60},{journal_days_30:3},{}])assert.ok(!BANNED.test(noteFor(s)));
 assert.match(noteFor({enough_data:true,rules_followed_pct:NaN,journal_days_30:0}),/process/);
});
