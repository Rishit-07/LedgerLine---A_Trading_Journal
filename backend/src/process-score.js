// Process score over the journal window. Each rate is 0–100. Missing components
// contribute neither points nor weight. A trade's prices and P&L are never inputs.
export function processScore(trades, sessions, maxTrades, forecastBrier) {
  const rate=(kept,total)=>total ? Math.round(100*kept/total) : null;
  const checked=trades.filter(trade=>trade.checks>0);
  const risk=checked.filter(trade=>typeof trade.riskKept==='boolean');
  const components=[
    {label:'Rules followed',weight:30,value:rate(checked.reduce((n,t)=>n+t.kept,0),checked.reduce((n,t)=>n+t.checks,0))},
    {label:'Risk discipline',weight:30,value:rate(risk.filter(t=>t.riskKept).length,risk.length)},
    {label:'Consistency',weight:20,value:rate(sessions.filter(n=>n<=maxTrades).length,sessions.length)},
    {label:'Journal completeness',weight:10,value:rate(trades.filter(t=>t.journaled).length,trades.length)},
    {label:'Forecast calibration',weight:10,value:forecastBrier==null?null:Math.round(100*(1-forecastBrier))},
  ];
  const coverage=components.reduce((n,c)=>n+(c.value===null?0:c.weight),0);
  return {components,coverage,value:coverage?Math.round(components.reduce((n,c)=>n+c.weight*(c.value??0),0)/coverage):null};
}
