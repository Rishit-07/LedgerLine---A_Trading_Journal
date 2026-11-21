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
const saveButton = '<button class="n-btn n-acc dash-button">Save changes</button><p role="status"></p>';
const panel = (key,title,content) => `<section class="n-out account-panel" data-preference="${key}" hidden><h2>${title}</h2>${content}</section>`;
export function settingsMarkup(notifications) {
  return `<div class="account-settings-layout account-board">
    <nav class="n-out account-panel account-nav" aria-label="Settings sections">${sections.map(([id,label],i)=>`<button type="button" class="n-btn" data-pref-tab="${id}"><span aria-hidden="true">${['◎','▦','☷','◷','☼','◇','▤'][i]}</span>${label}</button>`).join('')}</nav>
    <div class="account-settings-panels">
    ${panel('account','Account',`<form class="ws-form" data-edit="account"><label>Display name<input class="n-in" name="displayName" maxlength="100" required></label><fieldset><legend>Your markets</legend>${Object.entries(markets).map(([key,label])=>`<label><input name="markets" type="checkbox" value="${key}"> ${label}</label>`).join('')}</fieldset>${saveButton}</form>`)}
    ${panel('brokers','Brokers',`<p>Choose your preferred import method. CSV imports are available for any broker.</p><form data-edit="broker"><div class="account-providers">${providers.map(([key,label,api])=>`<label class="n-in"><span class="account-provider-icon">${label.slice(0,1)}</span><span><strong>${label}</strong><small>${api}</small></span><input type="radio" name="broker" value="${key}" required></label>`).join('')}</div><label><input type="radio" name="broker" value="manual"> Add trades by hand</label><div class="account-actions">${saveButton}<a href="/history#import">Import CSV</a></div></form><div class="account-read"><div class="n-in"><strong>What Ledgerline reads</strong><p>Trade rows from the CSV file you choose. Direct broker sync requires a connected integration.</p></div><div class="n-in"><strong>What it never does</strong><p>Place orders, move money or change positions in your brokerage account.</p></div></div>`)}
    ${panel('rules','Trading rules',`<form class="ws-form" data-edit="rules">${ruleDefinitions.map(([key,label,values,unit])=>`<div class="account-rule"><label>${label}<select name="${key}" class="n-in">${values.map(v=>`<option value="${v}">${v}${unit}</option>`).join('')}</select></label><label><input type="checkbox" name="hardRules" value="${key}"> Hard rule</label></div>`).join('')}${saveButton}</form>`)}
    <div data-preference="notifications" hidden>${notifications}</div>
    ${panel('appearance','Appearance','<p>Choose a light or dark workspace on this device.</p><button class="n-btn n-out dash-button" data-change-theme>Switch theme</button>')}
    ${panel('privacy','Data and privacy','<p>Choose what visitors can see on your portfolio or export your trades.</p><div class="account-actions"><a href="/portfolio">Portfolio visibility</a><a href="/history#export">Export trades as CSV</a></div>')}
    ${panel('billing','Plans and billing','<p>Ledgerline has no paid plans available.</p>')}
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
