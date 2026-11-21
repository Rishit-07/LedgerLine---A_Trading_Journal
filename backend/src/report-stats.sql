WITH profile AS (
 SELECT timezone,max_trades_per_day,(now() AT TIME ZONE timezone)::date today FROM user_profile WHERE user_id=$1
), bounds AS (
 SELECT *,date_trunc($2,today::timestamp)::date start_day FROM profile
), facts AS (
 SELECT t.id,(t.opened_at AT TIME ZONE b.timezone)::date AS day,b.max_trades_per_day,
 c.checks,c.kept,c.risk,
 t.reviewed_at IS NOT NULL OR EXISTS(SELECT 1 FROM journal_entries j WHERE j.user_id=$1 AND j.trade_id=t.id AND (trim(j.note)<>'' OR j.mood IS NOT NULL OR cardinality(tags)>0)) journaled
 FROM trades t CROSS JOIN bounds b CROSS JOIN LATERAL (
 SELECT count(*) checks,count(*) FILTER(WHERE kept) kept,bool_and(kept) FILTER(WHERE r.rule_key='risk') risk FROM trade_checks c JOIN rules r ON r.id=c.rule_id AND r.user_id=$1 WHERE c.trade_id=t.id AND c.user_id=$1
 ) c WHERE t.user_id=$1 AND (t.opened_at AT TIME ZONE b.timezone)::date BETWEEN (start_day-('1 '||$2)::interval)::date AND today
), sessions AS (
 SELECT day,date_trunc($2,day::timestamp)::date period,count(*) trades,sum(checks) checks,sum(kept) kept,
 count(risk) risks,count(*) FILTER(WHERE risk) risk_kept,count(*) FILTER(WHERE journaled) journaled,
 (count(*)<=max(max_trades_per_day))::int consistent FROM facts GROUP BY day
), totals AS (
 SELECT period,day,sum(trades)::int trades, sum(checks) checks,sum(kept) kept,
 round(100*sum(kept)/nullif(sum(checks),0)) adherence,round(100*sum(risk_kept)/nullif(sum(risks),0)) risk,
 round(100*avg(consistent)) consistency,round(100*sum(journaled)/sum(trades)) completeness FROM sessions GROUP BY GROUPING SETS ((period,day),(period))
), scores AS (
 SELECT x.*,round((30*coalesce(adherence,0)+30*coalesce(risk,0)+20*consistency+10*completeness+10*coalesce(f.calibration,0))/
 (30+30*(adherence IS NOT NULL)::int+30*(risk IS NOT NULL)::int+10*(f.calibration IS NOT NULL)::int))::int score FROM totals x CROSS JOIN bounds b CROSS JOIN LATERAL (
 SELECT round(100*(1-avg(power(probability/100.0-outcome::int,2)))) calibration FROM forecasts
 WHERE user_id=$1 AND outcome IS NOT NULL AND date_trunc($2,resolved_at AT TIME ZONE b.timezone)::date=x.period AND (x.day IS NULL OR (resolved_at AT TIME ZONE b.timezone)::date=x.day)
 ) f
)
SELECT start_day::text, today::text,
 coalesce((SELECT jsonb_build_object('trades',trades,'score',score,'adherence',adherence,'checks',checks,'kept',kept) FROM scores WHERE period=start_day AND day IS NULL),'{"trades":0}'::jsonb) ||
 jsonb_build_object('days',(SELECT count(*) FROM streak_days WHERE user_id=$1 AND day BETWEEN start_day AND today AND kind<>'freeze')) numbers,
 (SELECT score FROM scores WHERE period<start_day AND day IS NULL) previous,
 coalesce((SELECT jsonb_agg(jsonb_build_object('day',day,'score',score) ORDER BY day) FROM scores WHERE period=start_day AND day IS NOT NULL),'[]') trend,
 coalesce((SELECT jsonb_agg(x ORDER BY n DESC,kind) FROM (SELECT m.kind,count(*)::int n,array_agg(f.id::text ORDER BY f.id) trade_ids FROM mistakes m JOIN facts f ON m.trade_id=f.id WHERE m.user_id=$1 AND f.day>=start_day GROUP BY m.kind)x),'[]') mistakes,
 coalesce((SELECT array_agg(id::text ORDER BY id) FROM facts WHERE day>=start_day),'{}') ids,
 coalesce((SELECT array_agg(id::text ORDER BY id) FROM facts WHERE day>=start_day AND checks>kept),'{}') broken,
 (SELECT jsonb_build_object('daily_limit',(levels?'maxLoss')::int,'risk_defined',EXISTS(SELECT 1 FROM jsonb_array_elements(rules_snapshot) z WHERE z->>'text' ILIKE '%risk%')::int,'conditional',(coalesce(levels->>'notes','') ~* 'if.+then')::int) FROM plans WHERE user_id=$1 AND date=today+1) tomorrow,
 coalesce((SELECT current FROM streak_state WHERE user_id=$1),0) streak FROM bounds;

