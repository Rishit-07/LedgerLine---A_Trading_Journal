import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {configuredCoach,complete} from './coach.js';
import {send,readJson} from './http.js';
import {can,plans} from '../../src/config/plans.ts';

const statsSQL=readFileSync(new URL('./report-stats.sql',import.meta.url),'utf8');
const error=(status,message)=>Object.assign(new Error(message),{status});
const accessSQL=`SELECT coalesce((SELECT enabled FROM report_preferences WHERE user_id=$1),false) enabled,
 coalesce((SELECT 'mentor' FROM mentor_entitlements WHERE user_id=$1 AND active AND (expires_at IS NULL OR expires_at>now())),(SELECT plan FROM report_subscriptions WHERE user_id=$1 AND valid_until>now()),'free') plan,
 (SELECT count(*)::int FROM ai_review_usage WHERE user_id=$1 AND NOT free AND created_at>=date_trunc('month',now() AT TIME ZONE p.timezone) AT TIME ZONE p.timezone) used,
 EXISTS(SELECT 1 FROM ai_review_usage WHERE user_id=$1 AND free AND created_at>=date_trunc('week',now() AT TIME ZONE p.timezone) AT TIME ZONE p.timezone) weekly_used FROM user_profile p WHERE user_id=$1`;
export function authorize(access,kind){
 if(!access.enabled)throw error(403,'AI features are off. Enable AI reviews in Settings.');
 if(!can(access.plan,'aiReview') && kind!=='summary')throw error(403,'This review requires Pro.');
}
export function checkQuota(access){
 if(can(access.plan,'aiReview')?access.used>=plans[access.plan].monthlyReviews:access.weekly_used)throw error(429,'Your AI review allowance has been used. Past reviews are still available.');
}
export const insufficient=n=>n.trades<10 || n.days<3;

function reportFacts(stats,kind,topic){
 const facts=[];
 function add(metric,value,ids){if(Number.isFinite(value))facts.push({metric,value,ids});}
 if(kind==='plan'){
   if(!stats.tomorrow)throw error(422,'There is no saved plan for tomorrow.');
   for(const [key,value] of Object.entries(stats.tomorrow))add(key,value,[]);
 }else if(kind==='patterns'||kind==='experiment'){
   for(const [i,m] of stats.mistakes.entries())if(m.n>=(kind==='patterns'?3:2))add('recurring_mistake_'+(i+1),m.n,m.trade_ids);
   if(!facts.length)throw error(422,'More repeated observations are needed to identify a pattern.');
 }else{
   add('process_score',stats.numbers.score,stats.ids);add('rule_checks_kept',stats.numbers.kept,stats.ids);
   add('trades_with_rule_breaks',stats.broken.length,stats.broken);add('journal_days',stats.numbers.days,stats.ids);
   if(stats.previous!=null && stats.numbers.score!=null)add('score_change',stats.numbers.score-stats.previous,stats.ids);
 }
 if(kind==='ask'){
   const metric=topic==='rules'?'rule_checks_kept':topic==='mistakes'?'trades_with_rule_breaks':topic==='journal'?'journal_days':'process_score';
   return facts.filter(f=>f.metric===metric);
 }
 return facts;
}

export function validateReport(raw,facts){
 const report=JSON.parse(raw);
 const safeText=s=>typeof s==='string'&&s.length>0&&s.length<=3500&&!/[\d%₹$@<>]|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|twice|half|double|buy|sell|hold|predict|guarantee)\b/i.test(s);
 if(Object.keys(report).sort().join()!=='focus,observations,summary'||!safeText(report.summary)||!safeText(report.focus)||!Array.isArray(report.observations)||!report.observations.length||report.observations.length>facts.length)throw Error('Invalid review');
 const seen=new Set();
 for(const item of report.observations){
   const idx=facts.findIndex(f=>f.metric===item.metric),fact=facts[idx];
   if(!fact||seen.has(idx)||item.value!==fact.value||!safeText(item.text)||!Array.isArray(item.trade_ids)||item.trade_ids.join()!==(fact.ids.length?'e'+idx:'')||Object.keys(item).sort().join()!=='metric,text,trade_ids,value')throw Error('Unverified observation');
   seen.add(idx);item.trade_ids=fact.ids;
 }
 return report;
}

export async function generateReport({kind,facts,topic},config,ask=complete){
 const instructions='Write a private trading process review in English. Only explain supplied facts. Never give buy/sell/hold advice, market predictions, or praise or blame returns. Output JSON only, exactly {summary,observations:[{text,metric,value,trade_ids}],focus}. Copy metric, numeric value and trade_ids exactly from evidence. Do not use digits, numbers written as words, percentages, or quantities in prose. Use each relevant metric once. For full, write substantial paragraphs on discipline, omissions, comparison and an experiment. For plan check use questions. For summary keep it short. For experiments propose a concrete journal habit. For patterns discuss sample limitations. For ask answer only the requested metric.';
 const prompt={kind,topic,evidence:facts.map((f,i)=>({metric:f.metric,value:f.value,trade_ids:f.ids.length?['e'+i]:[]}))};
 for(let attempt=0;attempt<2;attempt++){
   const raw=await ask(config,instructions,[{role:'user',content:JSON.stringify(prompt)}],fetch,kind==='full'?2600:900);
   try{return validateReport(raw,facts);}catch{prompt.correction='Fix the JSON and copy evidence values and citation tokens exactly. No numbers in prose.';}
 }
 throw error(502,'The review did not match your journal. No review credit was used.');
}

export function reportApi(pool,authenticate){
 return async(req,res)=>{
   const claims=await authenticate(req,res);if(!claims)return;
   const uid=claims.uid,url=new URL(req.url,'http://localhost');
   let client;
   try{
    const body=req.method==='GET'?{}:(await readJson(req,4096)).data;
    if(!body||typeof body!=='object')throw error(400,'Invalid request.');
    client=await pool.connect();await client.query('BEGIN');
    if(req.method!=='GET')await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,21))',[uid]);
    const first=async(sql,args=[uid])=>(await client.query(sql,args)).rows[0];
    const access=await first(accessSQL);
    if(!access)throw error(409,'Finish onboarding first.');
    let result;
    if(url.pathname.endsWith('/preferences')){
      if(req.method==='PUT'){
        if(typeof body.enabled!=='boolean')throw error(400,'Choose an AI review preference.');
        await client.query('INSERT INTO report_preferences VALUES ($1,$2) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled',[uid,body.enabled]);
      }
      result={enabled:body.enabled??access.enabled,plan:access.plan};
    }else if(req.method==='DELETE'){
      await client.query('DELETE FROM ai_reports WHERE user_id=$1 AND id::text=$2',[uid,body.id]);result={deleted:true};
    }else{
      const kind=body.kind;
      if(req.method==='POST'){
        if(!['full','summary','patterns','plan','experiment','ask'].includes(kind))throw error(400,'Unknown review type.');
        authorize(access,kind);
      }
      const period=kind==='summary'?'week':(body.period??url.searchParams.get('period')??'week');
      if(!['week','month'].includes(period))throw error(400,'Unknown period.');
      const stats=await first(statsSQL,[uid,period]);
      if(req.method==='GET'){
        const past=(await client.query('SELECT id,period,kind,output,created_at FROM ai_reports WHERE user_id=$1 ORDER BY created_at DESC',[uid])).rows;
        const experiments=(await client.query(`SELECT e.kind,e.baseline,count(m.trade_id)::int current,CASE WHEN $2::date>=e.start_day+7 THEN 'complete' ELSE 'in progress' END status FROM report_experiments e LEFT JOIN mistakes m ON m.user_id=e.user_id AND m.kind=e.kind AND (m.created_at AT TIME ZONE (SELECT timezone FROM user_profile WHERE user_id=$1))::date BETWEEN start_day AND start_day+6 WHERE e.user_id=$1 GROUP BY e.user_id,e.start_day,e.kind,e.baseline ORDER BY e.start_day DESC`,[uid,stats.today])).rows;
        result={numbers:stats.numbers,previous:stats.previous,streak:stats.streak,trend:stats.trend,mistakes:stats.mistakes,enabled:access.enabled,pro:can(access.plan,'aiReview'),remaining:Math.max(0,plans[access.plan].monthlyReviews-access.used),past,experiments};
      }else if(insufficient(stats.numbers))result={insufficient_data:true};
      else{
        const topic=kind==='ask'?({'How consistently did I follow my rules?':'rules','How many trades broke a rule?':'mistakes','How often did I journal?':'journal','What was my process score?':'score'})[body.question]:undefined;
        if(kind==='ask'&&!topic)throw error(422,'Choose a journal question grounded in your records.');
        const facts=reportFacts(stats,kind,topic);
        if(!facts.length)throw error(422,'There is no evidence for this question yet.');
        const hash=createHash('sha256').update(JSON.stringify([kind,topic,period,stats.start_day,facts])).digest('hex');
        if(!body.regenerate)result=await first('SELECT * FROM ai_reports WHERE user_id=$1 AND input_hash=$2 ORDER BY created_at DESC LIMIT 1',[uid,hash]);
        if(!result){
          checkQuota(access);
          const config=configuredCoach(process.env);if(!config)throw error(503,'AI report generation is awaiting a provider connection.');
          const output=await generateReport({kind,topic,facts},config);
          result=await first('INSERT INTO ai_reports(user_id,period,kind,input_hash,output,model) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,period,kind,output,created_at',[uid,period,kind,hash,output,config.model]);
          await client.query('INSERT INTO ai_review_usage(user_id,free) VALUES($1,$2)',[uid,!can(access.plan,'aiReview')]);
          if(kind==='experiment'){
           const m=stats.mistakes[Number(output.observations[0].metric.split('_').pop())-1];
           await client.query(`INSERT INTO report_experiments SELECT $1,$2::date,$3,count(*)::int FROM mistakes WHERE user_id=$1 AND kind=$3 AND (created_at AT TIME ZONE (SELECT timezone FROM user_profile WHERE user_id=$1))::date BETWEEN $2::date-7 AND $2::date-1 HAVING NOT EXISTS(SELECT 1 FROM report_experiments WHERE user_id=$1 AND start_day>$2::date-7) ON CONFLICT DO NOTHING`,[uid,stats.today,m.kind]);
          }
        }
      }
    }
    await client.query('COMMIT');send(res,200,result);
   }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});send(res,e.status??503,{error:e.status?e.message:'Reports are temporarily unavailable.'});}
   finally{client?.release();}
 };
}
