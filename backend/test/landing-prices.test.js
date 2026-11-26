import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRICES} from '../src/billing-config.js';

// The landing page cannot import the server config, so this keeps the two copies from drifting apart.
test('landing page prices match billing-config.js',()=>{
 const src=readFileSync(new URL('../../frontend/src/landing-pricing.js',import.meta.url),'utf8');
 const dollars=c=>c/100;
 for(const [plan,p] of Object.entries(PRICES)){
  const block=src.match(new RegExp(plan+': \\{([^}]*)\\}'))[1];
  assert.equal(Number(block.match(/monthly: ([\d.]+)/)[1]),dollars(p.monthly),plan+' monthly');
  assert.equal(Number(block.match(/yearly: ([\d.]+)/)[1]),dollars(p.yearly),plan+' yearly');
  assert.equal(Number(block.match(/intro: ([\d.]+)/)[1]),dollars(p.intro),plan+' intro');
 }
});
