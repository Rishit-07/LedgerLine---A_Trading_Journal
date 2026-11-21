import { markets } from './workspace-ui.js';

function csvRows(text) {
  const rows=[];
  let row=[], field='', quoted=false;
  for(let index=0;index<text.length;index++){
    const char=text[index];
    if(char==='"'){
      if(quoted && text[index+1]==='"'){field+='"';index++;}
      else if(quoted || !field)quoted=!quoted;
      else throw new Error('Check the quotes in your CSV.');
    }else if(!quoted && char===','){row.push(field);field='';}
    else if(!quoted && (char==='\r'||char==='\n')){
      if(char==='\r'&&text[index+1]==='\n')index++;
      rows.push([...row,field]);row=[];field='';
    }else field+=char;
  }
  if(quoted)throw new Error('A quoted CSV field was not closed.');
  return [...rows,[...row,field]].filter((values)=>values.some((value)=>value.trim()));
}

export async function readTradeCsv(file) {
  if(file.size>120_000)throw new Error('Choose a CSV smaller than 120 KB.');
  const records=csvRows((await file.text()).replace(/^\uFEFF/,''));
  const expected=['date','symbol','market','side','setup','result r'];
  const header=records.shift()?.map((value)=>value.trim().toLowerCase())??[];
  if(expected.length!==header.length || expected.some((value,index)=>value!==header[index])){
    throw new Error('Use the Ledgerline CSV header: Date, Symbol, Market, Side, Setup, Result R.');
  }
  if(!records.length||records.length>100)throw new Error('Import between 1 and 100 trades at a time.');
  const now=Date.now();
  return Promise.all(records.map(async(values,index)=>{
    const [date,symbol,market,side,setup,result]=values.map((value)=>value.trim());
    const timestamp=Date.parse(date);
    if(values.length!==6||!/(?:Z|[+-]\d{2}:\d{2})$/i.test(date)||!Number.isFinite(timestamp)||
      timestamp>now||timestamp<now-48*3600000||!/^[A-Z0-9][A-Z0-9 .:/_-]{0,47}$/i.test(symbol)||
      !Object.hasOwn(markets,market)||!['long','short'].includes(side)||setup.length>100||
      (result!==''&&(!Number.isFinite(Number(result))||Math.abs(Number(result))>10000))){
      throw new Error('Check row '+(index+2)+'. Use a time within the last 48 hours and valid trade details.');
    }
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([values,index])));
    const hex=Array.from(new Uint8Array(bytes).slice(0,16),(value)=>value.toString(16).padStart(2,'0')).join('');
    const requestId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20,32)].join('-');
    return {requestId,occurredAt:new Date(timestamp).toISOString(),symbol,market,side,setup,
      result:result===''?null:Number(result),stop:null,target:null,kept:[]};
  }));
}
