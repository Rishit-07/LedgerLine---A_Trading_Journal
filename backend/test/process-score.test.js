import test from 'node:test';
import assert from 'node:assert/strict';
import { processScore } from '../src/process-score.js';

test('the process score is invariant to trade results and missing measurements do not count as failures',()=>{
  const trade={checks:2,kept:1,riskKept:true,journaled:true};
  const score=result=>processScore([{...trade,result}], [1], 3, null);
  assert.deepEqual(score(-5),score(12));
  assert.equal(score(0).coverage,90);
  assert.equal(score(0).value,83);
  assert.equal(processScore([],[],3,null).value,null);
});
