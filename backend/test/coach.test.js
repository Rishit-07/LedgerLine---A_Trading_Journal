import test from 'node:test';
import assert from 'node:assert/strict';
import { askCoach, configuredCoach, checkCoachScope } from '../src/coach.js';

test('scope check blocks programming directly and requires an exact affirmative classification for other requests', async () => {
  const config = configuredCoach({ GROQ_API_KEY:'test' });
  await assert.rejects(checkCoachScope(config,'Write a Python trading bot',[],() => assert.fail()),{status:422});
  for (const verdict of ['DENY','ALLOW and write a recipe','']) {
    await assert.rejects(checkCoachScope(config,'Can you bake me a cake?',[],async () =>
      Response.json({choices:[{message:{content:verdict}}]})));
  }
  await checkCoachScope(config,'Why did that happen?',[{question:'How was my trading week?',answer:'PRIVATE'}],async (_,options) => {
    assert.doesNotMatch(options.body,/PRIVATE/);
    return Response.json({choices:[{message:{content:'ALLOW'}}]});
  });
});

test('a Groq key enables chat for a new journal and follow-ups include recent turns',async()=>{
  const config=configuredCoach({GROQ_API_KEY:'test'});
  assert.equal(config.model,'openai/gpt-oss-120b');
  const history=[{question:'What should I log?',answer:'Write down your process.',sources:[]}];
  const answer=await askCoach(config,'Can you give an example?',[],history,async(url,options)=>{
    assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
    const {messages}=JSON.parse(options.body);
    assert.deepEqual(messages.slice(1,3),[{role:'user',content:history[0].question},{role:'assistant',content:history[0].answer}]);
    assert.deepEqual(JSON.parse(messages.at(-1).content).trades,[]);
    return Response.json({choices:[{message:{content:'Record your entry checklist.'}}]});
  });
  assert.equal(answer,'Record your entry checklist.');
});

test('provider selection, existing OpenAI configuration, and retryable limits',async()=>{
  assert.equal(configuredCoach({}),null);
  const config=configuredCoach({OPENAI_API_KEY:'test',LEDGERLINE_COACH_MODEL:'configured-model'});
  assert.equal(await askCoach(config,'Review my rules',[],[],async()=>Response.json({output:[{type:'message',content:[{type:'output_text',text:'Review saved.'}]}]})),'Review saved.');
  await assert.rejects(askCoach(config,'Another question',[],[],async()=>new Response(null,{status:429})),{status:429});
});

test('OpenRouter uses the free model and only eligible endpoints for journal context', async () => {
  const config = configuredCoach({ OPENROUTER_API_KEY: 'test', GROQ_API_KEY: 'fallback' });
  const answer = await askCoach(config, 'How should I review this?', [], [], async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'inclusionai/ling-3.2-flash:free');
    assert.deepEqual(body.provider, { zdr: true, data_collection: 'deny' });
    assert.equal(body.messages.at(-1).role, 'user');
    return Response.json({ choices: [{ message: { content: 'Start with the checklist.' } }] });
  });
  assert.equal(answer, 'Start with the checklist.');
});
