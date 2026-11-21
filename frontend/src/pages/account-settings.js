import { markets, submit } from './workspace-ui.js';

const sections = [
  ['account','Account','user'],['brokers','Brokers','briefcase-business'],['rules','Trading rules','list-checks'],
  ['notifications','Notifications','bell'],['appearance','Appearance','sun'],['privacy','Data and privacy','shield'],['billing','Plans and billing','credit-card']
];
const providers = [
  ['zerodha','Zerodha','Kite Connect'],['upstox','Upstox','Upstox API'],['angel-one','Angel One','SmartAPI'],
  ['dhan','Dhan','DhanHQ'],['fyers','Fyers','Fyers API'],['csv','CSV file','Any broker']
];
const ruleDefinitions = [['risk','Risk per trade',[0.25,0.5,1,1.5,2],'%'],['loss','Daily loss limit',[1,2,3,4],'R'],['trades','Max trades per day',[2,3,5,8,10],'']];
const iconPaths = {
  user:'M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0 M4 21a8 8 0 0 1 16 0',
  'briefcase-business':'M10 14l4-4 M9 15l-1 1a3 3 0 1 1-4-4l4-4a3 3 0 0 1 4 0 M12 16a3 3 0 0 0 4 0l4-4a3 3 0 1 0-4-4l-1 1',
  'list-checks':'M12 3l8 3v6c0 5-4 8-8 10-4-2-8-5-8-10V6z M8 12l3 3 5-6',
  bell:'M4 18h16l-2-3V9a6 6 0 0 0-12 0v6z M10 21h4',
  sun:'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M20 4l-2 2 M6 18l-2 2',
  shield:'M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3',
  'credit-card':'M3 7h18v14H3z M8 7V4h8v3 M3 12h18'
};
const saveButton = '<button class="n-btn n-acc dash-button">Save changes</button><p role="status"></p>';
const panel = (key,title,content) => `<section class="n-out account-panel" data-preference="${key}" hidden><h2>${title}</h2>${content}</section>`;
export function settingsMarkup(notifications) {
  return `<div class="account-settings-layout account-board">
    <nav class="n-out account-panel account-nav" aria-label="Settings sections">${sections.map(([id,label,icon])=>`<button type="button" class="n-btn" data-pref-tab="${id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPaths[icon]}"/></svg>${label}</button>`).join('')}</nav>
    <div class="account-settings-panels">
    ${panel('account','Account',`<form class="ws-form" data-edit="account"><label>Display name<input class="n-in" name="displayName" maxlength="100" required></label><fieldset><legend>Your markets</legend>${Object.entries(markets).map(([key,label])=>`<label><input name="markets" type="checkbox" value="${key}"> ${label}</label>`).join('')}</fieldset>${saveButton}</form>`)}
    ${panel('brokers','Brokers',`<p>Choose your preferred import method. CSV imports are available for any broker.</p><form data-edit="broker"><div class="account-providers">${providers.map(([key,label,api])=>`<label class="n-out"><span class="account-provider-icon">${key==='csv'?'CSV':label.slice(0,1)}</span><span><strong>${label}</strong><small>${api}</small></span><input type="radio" name="broker" value="${key}" required></label>`).join('')}</div><label><input type="radio" name="broker" value="manual"> Add trades by hand</label><div class="account-actions">${saveButton}<a href="/history#import">Import CSV</a></div></form><div class="account-read"><div class="n-in"><strong>What Ledgerline reads</strong><p>Trade rows from the CSV file you choose. Direct broker sync requires a connected integration.</p></div><div class="n-in"><strong>What it never does</strong><p>Place orders, move money or change positions in your brokerage account.</p></div></div>`)}
    ${panel('rules','Trading rules',`<form class="ws-form" data-edit="rules">${ruleDefinitions.map(([key,label,values,unit])=>`<div class="account-rule"><label>${label}<select name="${key}" class="n-in">${values.map(v=>`<option value="${v}">${v}${unit}</option>`).join('')}</select></label><label><input type="checkbox" name="hardRules" value="${key}"> Hard rule</label></div>`).join('')}${saveButton}</form>`)}
    <div data-preference="notifications" hidden>${notifications}</div>
    ${panel('appearance','Appearance','<p>Choose a light or dark workspace on this device.</p><button class="n-btn n-out dash-button" data-change-theme>Switch theme</button>')}
    ${panel('privacy','Data and privacy','<label><input type="checkbox" data-report-consent disabled> Allow AI reviews to use my aggregated trading records</label><p data-consent-status role="status"></p><p>Choose what visitors can see on your portfolio or export your trades.</p><div class="account-actions"><a href="/portfolio">Portfolio visibility</a><a href="/history#export">Export trades as CSV</a></div>')}
    ${panel('billing','Plans and billing','<p>Billing has its own page now: your plan, payment method (UPI, card or crypto), crypto period and invoices all live there.</p><a class="n-btn n-acc dash-button" href="/billing">Open billing</a>')}
    </div></div>`;
}

export async function bindAccountSettings(page,request) {

  const selectSection = () => {
    const hash=location.hash.slice(1);
    const id=sections.some(([key])=>key===hash)?hash:'brokers';
    for(const button of page.querySelectorAll('[data-pref-tab]')) button.setAttribute('aria-pressed',String(button.dataset.prefTab===id));
    for(const item of page.querySelectorAll('[data-preference]')) item.hidden=item.dataset.preference!==id;
  };
  for(const button of page.querySelectorAll('[data-pref-tab]')) button.onclick=()=>{
    history.replaceState(history.state,'','#'+button.dataset.prefTab);selectSection();
  };
  selectSection();
  page.querySelector('[data-change-theme]').onclick=()=>page.querySelector('[data-page-theme]').click();
  const consent=page.querySelector('[data-report-consent]'),message=page.querySelector('[data-consent-status]');
  try {
    const prefs=await request('/api/reports/preferences','GET');
    consent.checked=prefs.enabled;consent.disabled=false;
    consent.onchange=async()=>{consent.disabled=true;try{await request('/api/reports/preferences','PUT',{enabled:consent.checked});message.textContent='Preference saved.';}catch(e){consent.checked=!consent.checked;message.textContent=e.message;}finally{consent.disabled=false;}};
  }catch(e){message.textContent=e.message;}
  const profile=await request('/api/onboarding','GET');
  for(const form of page.querySelectorAll('[data-edit]')) {
    const section=form.dataset.edit;
    for(const field of form.elements) {
      if(!field.name) continue;
      if(field.type==='checkbox') field.checked=profile[field.name]?.includes(field.value) ?? false;
      else if(field.type==='radio') field.checked=field.value===(profile[field.name] ?? 'manual');
      else field.value=profile[field.name] ?? '';
    }
    const status=form.querySelector('[role=status]');
    form.onsubmit=event=>submit(event,status,async()=>{
      const data=new FormData(form);
      let payload={section,broker:data.get('broker')};
      if(section==='account') {
        payload={section,displayName:data.get('displayName').trim(),markets:data.getAll('markets')};
        if(!payload.markets.length) throw new Error('Choose at least one market.');
      } else if(section==='rules') payload={section,hardRules:data.getAll('hardRules'),risk:Number(data.get('risk')),loss:Number(data.get('loss')),trades:Number(data.get('trades'))};
      await request('/api/onboarding','PUT',payload);
      return section==='broker'?'Import preference saved.':'Changes saved.';
    });
  }
}
