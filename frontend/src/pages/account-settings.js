import {screenshotData} from '../components/trade-screenshots.js';
import { enrolTotp, removeTotp, twoStepStatus } from '../mfa.js';
import {avatarUrl} from './profile-picture.js';
import { portfolioPath, portfolioVisibilityMarkup, fillPortfolioVisibility, readPortfolioVisibility } from './portfolio-preferences.js';
import { markets, submit, formValues } from './workspace-ui.js';
import { savePop, localPop } from '../features/ledger-bot/index.js';

const sections = [
  ['account','Account','user'],['brokers','Brokers','briefcase-business'],['rules','Trading rules','list-checks'],
  ['notifications','Notifications','bell'],['appearance','Appearance','sun'],['portfolio','Portfolio','user'],['security','Two-step sign-in','shield'],['privacy','Data and privacy','shield'],['billing','Plans and billing','credit-card']
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
const saveButton = '<button class="btn btn-primary">Save changes</button><p role="status"></p>';
const panel = (key,title,content) => `<section class="n-out account-panel" data-preference="${key}" hidden><h2>${title}</h2>${content}</section>`;
export function settingsMarkup(notifications) {
  return `<div class="account-settings-layout account-board">
    <nav class="n-out account-panel account-nav" aria-label="Settings sections">${sections.map(([id,label,icon])=>`<button type="button" class="btn btn-ghost" data-pref-tab="${id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPaths[icon]}"/></svg>${label}</button>`).join('')}</nav>
    <div class="account-settings-panels">
    ${panel('account','Account',`<form class="ws-form" data-avatar-form><label>Profile picture<input name="picture" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="account-actions"><button class="btn btn-primary">Save picture</button><button class="btn btn-danger" type="button" data-remove-avatar>Remove picture</button></div><p role="status"></p></form><form class="ws-form" data-edit="account"><label>Display name<input class="n-in" name="displayName" maxlength="100" required></label><fieldset><legend>Your markets</legend>${Object.entries(markets).map(([key,label])=>`<label><input name="markets" type="checkbox" value="${key}"> ${label}</label>`).join('')}</fieldset>${saveButton}</form>`)}
    ${panel('brokers','Brokers',`<p>Choose your preferred import method. CSV imports are available for any broker.</p><form data-edit="broker"><div class="account-providers">${providers.map(([key,label,api])=>`<label class="n-out"><span class="account-provider-icon">${key==='csv'?'CSV':label.slice(0,1)}</span><span><strong>${label}</strong><small>${api}</small></span><input type="radio" name="broker" value="${key}" required></label>`).join('')}</div><label><input type="radio" name="broker" value="manual"> Add trades by hand</label><div class="account-actions">${saveButton}<a href="/history#import">Import CSV</a></div></form><div class="account-read"><div class="n-in"><strong>What Ledgerline reads</strong><p>Trade rows from the CSV file you choose. Direct broker sync requires a connected integration.</p></div><div class="n-in"><strong>What it never does</strong><p>Place orders, move money or change positions in your brokerage account.</p></div></div>`)}
    ${panel('rules','Trading rules',`<form class="ws-form" data-edit="rules">${ruleDefinitions.map(([key,label,values,unit])=>`<div class="account-rule"><label>${label}<select name="${key}" class="n-in">${values.map(v=>`<option value="${v}">${v}${unit}</option>`).join('')}</select></label><label><input type="checkbox" name="hardRules" value="${key}"> Hard rule</label></div>`).join('')}${saveButton}</form><div class="lb-setting"><div><strong>Ledger bot pops in and out</strong><small>Appears for a few seconds every 5 minutes. Turn off to keep Ledger on screen, still, with no animation.</small></div><button type="button" class="n-switch n-in on" data-bot-pop aria-pressed="true" aria-label="Ledger bot pops in and out"><span class="n-knob"></span></button></div><p role="status" data-bot-pop-status></p>`)}
    <div data-preference="notifications" hidden>${notifications}</div>
    ${panel('appearance','Appearance','<p>Choose a light or dark workspace on this device.</p><button class="btn btn-secondary" data-change-theme>Switch theme</button>')}
    ${panel('security','Two-step sign-in','<p>Ask for a 6-digit code from an authenticator app each time you sign in. This protects your journal even if your password leaks.</p><p data-mfa-state role="status"></p><div class="btn-row"><button type="button" class="btn btn-primary" data-mfa-on hidden>Turn on two-step sign-in</button><button type="button" class="btn btn-danger" data-mfa-off hidden>Turn off</button></div>')}
    ${panel('privacy','Data and privacy','<label><input type="checkbox" data-report-consent disabled> Allow AI reviews to use my aggregated trading records</label><p data-consent-status role="status"></p><p>Choose what visitors can see on your portfolio or export your trades.</p><div class="account-actions"><a href="/settings#portfolio">Portfolio visibility</a><a href="/history#export">Export trades as CSV</a></div><h3>Your data</h3><p>Download a copy of everything Ledgerline holds about you, or delete your account. Deleting removes your journal, settings and community activity and cannot be undone.</p><div class="btn-row"><button type="button" class="btn btn-secondary" data-export-data>Download my data</button><button type="button" class="btn btn-danger" data-delete-account>Delete my account…</button></div><p data-data-status role="status"></p>')}
    ${panel('portfolio','Portfolio',`<form class="ws-form" data-portfolio-settings>${portfolioVisibilityMarkup}<button class="btn btn-primary" disabled>Save portfolio settings</button><p role="status"></p></form><div class="account-actions"><a data-own-portfolio href="/portfolio">Open my portfolio</a></div>`)}
    ${panel('billing','Plans and billing','<p>Billing has its own page now: your plan, payment method (UPI, card or crypto), crypto period and invoices all live there.</p><a class="btn btn-primary" href="/billing">Open billing</a>')}
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
  window.addEventListener('hashchange',selectSection);
  const botSwitch=page.querySelector('[data-bot-pop]'),botStatus=page.querySelector('[data-bot-pop-status]');
  const paintBot=on=>{botSwitch.classList.toggle('on',on);botSwitch.setAttribute('aria-pressed',String(on));};
  paintBot(localPop());
  botSwitch.onclick=async()=>{
    const next=!botSwitch.classList.contains('on');paintBot(next);botSwitch.disabled=true;botStatus.textContent='';
    try{await savePop(request,next);botStatus.textContent=next?'Ledger will pop in and out.':'Ledger stays on screen and still.';}
    catch(e){paintBot(!next);botStatus.textContent=e.message;}
    finally{botSwitch.disabled=false;}
  };
  const portfolioForm=page.querySelector('[data-portfolio-settings]');
  const portfolioStatus=portfolioForm.querySelector('[role=status]');
  const setPortfolio=portfolio=>{
    fillPortfolioVisibility(portfolioForm,portfolio);
    page.querySelector('[data-own-portfolio]').href=portfolio?.slug?portfolioPath(portfolio.slug):'/portfolio';
    portfolioForm.querySelector('button').disabled=false;
  };
  void request('/api/workspace?page=portfolio','GET').then(({portfolio})=>setPortfolio(portfolio))
    .catch(error=>{portfolioStatus.textContent=error.message;});
  portfolioForm.onsubmit=event=>submit(event,portfolioStatus,async()=>{
    const {portfolio}=await request('/api/workspace?page=portfolio','POST',{action:'visibility',...readPortfolioVisibility(formValues(portfolioForm))});
    setPortfolio(portfolio);
    return 'Portfolio settings saved.';
  });
  page.querySelector('[data-change-theme]').onclick=()=>page.querySelector('[data-page-theme]').click();
  const consent=page.querySelector('[data-report-consent]'),message=page.querySelector('[data-consent-status]');
  try {
    const prefs=await request('/api/reports/preferences','GET');
    consent.checked=prefs.enabled;consent.disabled=false;
    consent.onchange=async()=>{consent.disabled=true;try{await request('/api/reports/preferences','PUT',{enabled:consent.checked});message.textContent='Preference saved.';}catch(e){consent.checked=!consent.checked;message.textContent=e.message;}finally{consent.disabled=false;}};
  }catch(e){message.textContent=e.message;}
  const mfaState=page.querySelector('[data-mfa-state]'),mfaOn=page.querySelector('[data-mfa-on]'),mfaOff=page.querySelector('[data-mfa-off]');
  const showMfa=async()=>{
    try{
      const state=await twoStepStatus();
      if(!state.available){mfaState.textContent='Two-step sign-in is not switched on for this server yet.';mfaOn.hidden=mfaOff.hidden=true;return;}
      mfaState.textContent=state.enabled?'Two-step sign-in is on. Recovery codes left: '+state.recoveryLeft+'.':'Two-step sign-in is off.';
      mfaOn.hidden=state.enabled;mfaOff.hidden=!state.enabled;
    }catch{mfaState.textContent='Could not load this setting. Try again.';}
  };
  void showMfa();
  mfaOn.onclick=async()=>{try{if(await enrolTotp())await showMfa();}catch(error){mfaState.textContent=error.message;}};
  mfaOff.onclick=async()=>{try{if(await removeTotp())await showMfa();}catch(error){mfaState.textContent=error.message;}};
  const dataStatus=page.querySelector('[data-data-status]');
  page.querySelector('[data-export-data]').onclick=async event=>{
    const button=event.currentTarget;button.setAttribute('aria-disabled','true');button.classList.add('is-loading');dataStatus.textContent='';
    try{
      const data=await request('/api/account/export','GET');
      const link=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),download:'ledgerline-export.json'});
      link.click();URL.revokeObjectURL(link.href);dataStatus.textContent='Your data was downloaded.';
    }catch(error){dataStatus.textContent=error.message;}
    finally{button.removeAttribute('aria-disabled');button.classList.remove('is-loading');}
  };
  page.querySelector('[data-delete-account]').onclick=()=>{
    const dialog=document.createElement('dialog');
    dialog.className='n-out dash-dialog';dialog.setAttribute('aria-label','Delete account');
    dialog.innerHTML='<h2>Delete your account?</h2><p>This permanently removes your journal, settings, portfolio and community activity. It cannot be undone. Download your data first if you want a copy.</p><form class="ws-form"><label>Type DELETE to confirm<input name="confirm" autocomplete="off" required pattern="DELETE" data-required-message="Type DELETE to confirm"></label><p role="status"></p><div class="form-actions"><button type="button" class="btn btn-secondary" data-cancel>Cancel</button><button type="submit" class="btn btn-danger">Delete my account</button></div></form>';
    const form=dialog.querySelector('form'),status=dialog.querySelector('[role=status]');
    dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>dialog.remove());
    form.onsubmit=async event=>{
      event.preventDefault();
      const submitButton=form.querySelector('[type=submit]');submitButton.setAttribute('aria-disabled','true');submitButton.classList.add('is-loading');
      try{await request('/api/account','DELETE',{confirm:form.elements.confirm.value});location.assign('/');}
      catch(error){status.textContent=error.message;submitButton.removeAttribute('aria-disabled');submitButton.classList.remove('is-loading');}
    };
    page.append(dialog);dialog.showModal();
  };
  const avatarForm=page.querySelector('[data-avatar-form]');
  const avatarStatus=avatarForm.querySelector('[role=status]');
  async function saveAvatar(remove){
    const file=avatarForm.elements.picture.files[0];
    if(!remove&&!file){avatarStatus.textContent='Choose a picture first.';return;}
    const controls=[...avatarForm.querySelectorAll('button,input')];
    controls.forEach(control=>control.disabled=true);
    try{
      const {avatar}=await request('/api/profile-picture','PUT',{image:remove?null:await screenshotData(file)});
      for(const photo of page.querySelectorAll('[data-account-photo]')){
        if(avatar){photo.src=avatarUrl(avatar);photo.hidden=false;}else photo.hidden=true;
      }
      avatarForm.reset();
      avatarStatus.textContent=remove?'Profile picture removed.':'Profile picture saved.';
    }catch(error){avatarStatus.textContent=error.message;}
    finally{controls.forEach(control=>control.disabled=false);}
  }
  avatarForm.onsubmit=event=>{event.preventDefault();void saveAvatar(false);};
  avatarForm.querySelector('[data-remove-avatar]').onclick=()=>saveAvatar(true);
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
