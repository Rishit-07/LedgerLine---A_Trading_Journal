import {medal} from './badge-shelf.js';
import {avatarUrl} from './profile-picture.js';
import { portfolioPath, portfolioSections, readPortfolioVisibility } from './portfolio-preferences.js';
import {buildPortfolioCard, openPortfolioShare, portfolioCardFormats, portfolioCardMetrics, portfolioStatKeys} from './portfolio-share-card.js';
import { node, select, stat, rate, submit, formValues, markets } from './workspace-ui.js';
import './portfolio-preview.css';
import './portfolio-editor.css';
import './workspace.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/dm-serif-display/latin-400.css';
import '@fontsource-variable/caveat';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import './streak.css';


const portfolioDesigns = [
  ['dashboard','Dashboard','Score, stats and charts in the Ledgerline look'],
  ['marginalia','Marginalia','Paper sheets marked up with a periwinkle pen'],
  ['terracotta','Terracotta','Warm paper, teal night sheets, terracotta pen'],
];
const visibilityOptions = [
  ['private','Private','Only you can see this page. Use it to build and preview.'],
  ['link','Anyone with link','Anyone with the saved link or QR can open your portfolio.'],
  ['public','Public','Anyone can open your portfolio, and it can appear in Network.'],
];
const qrColors = { Ink:'#171724', Indigo:'#4f5bd5', Green:'#176244' };

export const portfolio = {
  title:'Portfolio',
  description:'Build it once, share it as a card, link or QR.',
  action:'<div class="pf-top-share"><button type="button" class="n-btn n-acc dash-button" data-customize-profile>Customize</button><a class="n-btn n-out dash-button" data-open-shared-profile aria-disabled="true">Open shared profile</a><button type="button" class="n-btn n-out dash-button" data-copy-portfolio>Copy link</button></div>',
  content:`<div class="n-in pf-disclosure">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z M12 8v4m0 4h.01"/></svg>
      <p><strong>What goes public</strong> Your portfolio shows process: rules kept, streaks and reviews. It does not show returns, account size or instrument names, and it makes no promises of profit.</p>
    </div>
    <div class="pf-editor">
      <div class="pf-editor-left">
        <section class="n-out pf-panel" id="portfolio-visibility" aria-labelledby="pf-visibility-heading">
          <h2 id="pf-visibility-heading">Who can see it</h2>
          <div class="n-in pf-segment" role="group" aria-label="Portfolio visibility">
            ${visibilityOptions.map(([key,label])=>`<button type="button" class="n-btn" data-pf-visibility="${key}">${label}</button>`).join('')}
          </div>
          <p class="n-in pf-note" data-visibility-note></p>
          <button type="button" class="n-btn n-acc dash-button" data-pf-save-visibility hidden>Save visibility</button>
          <p role="status" data-visibility-status></p>
        </section>
        <section class="n-out pf-panel" aria-labelledby="pf-profile-heading">
          <h2 id="pf-profile-heading">Profile</h2>
          <form class="ws-form pf-profile-form" id="portfolio-profile-form" data-portfolio-form>
            <label>Display name<input class="n-in" name="displayName" maxlength="100" required></label>
            <div><span class="pf-field-label">Link</span><div class="n-in pf-saved-link" data-pf-link></div></div>
            <label>Headline<input class="n-in" name="headline" maxlength="120"></label>
            <label>About<textarea class="n-in" name="about" rows="4" maxlength="1000"></textarea></label>
            <div data-pf-markets hidden><span class="pf-field-label">Markets</span><div class="pf-market-list"></div></div>
            <button class="n-btn n-acc dash-button" type="submit">Save portfolio</button>
          </form>
          <p role="status" data-portfolio-status></p>
        </section>
        <section class="n-out pf-panel" aria-labelledby="pf-sections-heading">
          <h2 id="pf-sections-heading">What it shows</h2>
          <p class="pf-muted">Switch sections on or off. The preview updates.</p>
          <form data-pf-sections class="pf-section-form">
            ${Object.entries(portfolioSections).map(([key,label])=>`<label><span>${label}<small>${({streak:'Current streak, best and level',adherence:'Percentage of trade checks you kept',reviews:'From your journal',photo:'Your current Ledgerline profile picture',setupStats:'Trade counts and rule adherence for published setups'})[key]}</small></span><input type="checkbox" role="switch" name="${key}"></label>`).join('')}
            <button class="n-btn n-acc dash-button" type="submit">Save sections</button>
            <p role="status" data-sections-status></p>
          </form>
        </section>
        <section class="n-out pf-panel">
          <div class="pf-panel-heading"><h2>Your badges</h2><a href="/badges">Manage badges</a></div>
          <div class="pf-earned-badges" data-earned-badges></div>
        </section>
        <section class="n-out pf-panel">
          <h2>Privacy</h2>
          <p class="pf-muted">Account balance and broker details are never on a portfolio.</p>
          <a class="n-btn n-out dash-button" href="/settings#portfolio">Portfolio settings</a>
        </section>
      </div>
      <div class="pf-editor-right">
        <section class="n-out pf-panel pf-design-panel">
          <div class="pf-panel-heading"><h2 id="pf-design-heading">Portfolio design</h2><small>Your QR and link open the one you pick</small></div>
          <div role="group" aria-labelledby="pf-design-heading" class="pf-design-grid">
            ${portfolioDesigns.map(([key,label,detail])=>`<label class="pf-design-choice n-out" data-look="${key}">
              <input type="radio" name="design" form="portfolio-profile-form" value="${key}">
              <span class="pf-design-thumb" aria-hidden="true">
                <span class="pf-thumb-paper"><span data-pf-monogram></span><i></i></span>
                <span class="pf-thumb-notes"><i></i><i></i></span>
              </span>
              <strong>${label}</strong><small>${detail}</small>
            </label>`).join('')}
          </div>
          <p class="pf-muted">Every design shows the same process-only facts, so switching never changes what you reveal.</p>
        </section>
        <div class="pf-preview" data-portfolio-preview aria-label="Live portfolio preview"></div>
        <section class="n-out pf-panel">
          <div class="pf-panel-heading"><h2>Share cards</h2>
            <div class="n-in pf-segment" role="group" aria-label="Share card format">
              ${Object.entries(portfolioCardFormats).map(([key,format])=>`<button class="n-btn" type="button" data-card-format="${key}">${format.label}</button>`).join('')}
            </div>
          </div>
          <div class="pf-card-preview"><canvas role="img" aria-label="Portfolio share card" data-card-canvas hidden></canvas></div>
          <p class="pf-muted" data-card-status role="status"></p>
          <div class="ws-actions">
            <button type="button" class="n-btn n-out dash-button" data-card-include hidden>Choose stats to share</button>
            <button type="button" class="n-btn n-acc dash-button" data-card-download disabled>Save image</button>
          </div>
        </section>
        <section class="n-out pf-panel">
          <div class="pf-panel-heading"><h2>Share access</h2><small data-preview-visibility></small></div>
          <p class="pf-muted" data-share-status></p>
          <div class="ws-actions" data-portfolio-share hidden>
            <a class="n-btn n-out dash-button" data-public-link target="_blank" rel="noopener">Open shared portfolio</a>
            <button type="button" class="n-btn n-out dash-button" data-share-card>Share card</button>
            <button type="button" class="n-btn n-out dash-button" data-copy-portfolio>Copy portfolio link</button>
          </div>
          <p role="status" data-portfolio-copy-status></p>
        </section>
        <section class="n-out pf-panel pf-qr-panel">
          <h2>Portfolio QR</h2>
          <p class="pf-muted">Print it on a CV or a business card, or show it on a screen. It opens your saved portfolio.</p>
          <p data-qr-empty></p>
          <div class="pf-qr-layout" data-qr-layout hidden>
            <figure class="streak-invite-qr pf-personal-qr"><div class="streak-qr-frame"><canvas role="img" aria-label="QR to open the saved portfolio"></canvas></div><figcaption data-qr-caption></figcaption></figure>
            <div>
              <span class="pf-field-label">Code colour</span>
              <div class="pf-qr-colors" role="group" aria-label="QR colour">${Object.keys(qrColors).map(color=>`<button type="button" class="n-btn n-out dash-button" data-qr-color="${color}">${color}</button>`).join('')}</div>
              <code data-qr-url></code>
              <div class="ws-actions">
                <button type="button" class="n-btn n-acc dash-button" data-qr-png>Download PNG</button>
                <button type="button" class="n-btn n-out dash-button" data-qr-svg>SVG</button>
                <button type="button" class="n-btn n-out dash-button" data-qr-print>Print sheet</button>
              </div>
              <p role="status" data-qr-status></p>
            </div>
          </div>
        </section>
      </div>
    </div>`,
  bind(page, { data, save }) {
    const find = selector => select(page,selector);
    const form = find('[data-portfolio-form]');
    const sectionForm = find('[data-pf-sections]');
    const preview = find('[data-portfolio-preview]');
    const share = find('[data-portfolio-share]');
    const copyStatus = find('[data-portfolio-copy-status]');
    const visibilityStatus = find('[data-visibility-status]');
    const sectionStatus = find('[data-sections-status]');
    const canvas = find('.pf-qr-panel canvas');
    const qrStatus = find('[data-qr-status]');
    let saved = data.portfolio;
    let visibility = saved?.visibility ?? 'private';
    let color = 'Ink';
    let activeQR;
    let cardFormat = 'story';
    let activeCard;
    let saveInProgress = false;
    const stats = {...data.stats, streak:data.account.streak, best:data.account.best, level:data.account.level, avatar:data.avatar};

    form.elements.displayName.value = saved?.displayName || data.account.displayName;
    form.elements.headline.value = saved?.headline ?? '';
    form.elements.about.value = saved?.about ?? '';
    form.elements.design.value = saved?.design ?? 'marginalia';
    for (const key of Object.keys(portfolioSections)) sectionForm.elements[key].checked = saved?.sections?.[key] === true;

    const badgeList=find('[data-earned-badges]');
    for(const badge of data.badges ?? []) {
      const row=node('div'), details=node('div');
      if(badge.iconPath) row.append(medal(badge));
      details.append(node('strong',badge.name),node('small',badge.shared?'Shared on portfolio':'Only visible to you'));
      row.append(details);badgeList.append(row);
    }
    if(!badgeList.childElementCount)badgeList.append(node('p','Badges you earn appear here.','pf-muted'));
    const marketsBox = find('[data-pf-markets]');
    const marketNames = (data.account.markets ?? []).map(key=>markets[key]).filter(Boolean);
    marketsBox.hidden = !marketNames.length;
    marketsBox.querySelector('.pf-market-list').append(...marketNames.map(name=>node('span',name,'n-in')));

    function paint() {
      const values = formValues(form);
      const name = values.displayName.trim() || data.account.displayName;
      const sections = readPortfolioVisibility(formValues(sectionForm)).sections;
      preview.dataset.design = values.design;
      preview.replaceChildren(...buildPortfolioSheets({
        displayName:name, headline:values.headline.trim(), about:values.about.trim(), sections,
        stats, avatar:sections.photo?data.avatar:null, badges:data.badges?.filter(b=>b.shared!==false),
      },'h3').sheets);
      for (const mark of page.querySelectorAll('[data-pf-monogram]')) mark.textContent = Array.from(name).slice(0,2).join('');
      for (const control of page.querySelectorAll('[data-pf-visibility]')) {
        control.setAttribute('aria-pressed',String(control.dataset.pfVisibility===visibility));
      }
      find('[data-visibility-note]').textContent = visibilityOptions.find(([key])=>key===visibility)[2];
      find('[data-pf-save-visibility]').hidden = visibility===(saved?.visibility ?? 'private');
    }

    function paintSharing() {
      const url = saved?.slug ? new URL(portfolioPath(saved.slug),location.origin).href : '';
      const shareable = Boolean(url && saved.visibility !== 'private');
      find('[data-pf-link]').textContent = url || 'Your link is created when you save.';
      find('[data-preview-visibility]').textContent = visibilityOptions.find(([key])=>key===(saved?.visibility ?? 'private'))[1];
      const help = 'Save your portfolio with Anyone with link or Public access to share it.';
      find('[data-share-status]').textContent = shareable ? 'Visitors see your saved portfolio.' : help;
      find('[data-qr-empty]').textContent = shareable ? '' : help;
      find('[data-qr-layout]').hidden = !shareable;
      share.hidden = !shareable;
      if (shareable) find('[data-public-link]').href = url;
      const openProfile=find('[data-open-shared-profile]');
      openProfile.setAttribute('aria-disabled',String(!url));
      openProfile.textContent=shareable?'Open shared profile':'Open portfolio preview';
      if(url){openProfile.href=url;openProfile.target='_blank';openProfile.rel='noopener';}
      else openProfile.removeAttribute('href');
      find('[data-qr-caption]').textContent='Scan to view '+(saved?.displayName||data.account.displayName)+'’s portfolio';
      find('[data-qr-url]').textContent = shareable ? url : '';
      void drawQR(shareable ? url : '');
      void drawCard(shareable ? url : '');
    }

    async function drawCard(url) {
      const task = {};
      activeCard = task;
      const card = find('[data-card-canvas]');
      const download = find('[data-card-download]');
      const status = find('[data-card-status]');
      const format = cardFormat;
      const chosen = readPortfolioVisibility(formValues(sectionForm)).sections;
      const savedSections = saved?.sections ?? {};
      const ownerOnly = !portfolioCardMetrics(chosen,stats).length;
      const unsaved = Object.keys(portfolioSections).some(key=>chosen[key] !== (savedSections[key]===true));
      const previewSections = ownerOnly
        ? {...chosen,...Object.fromEntries(portfolioStatKeys.map(key=>[key,Number.isFinite(stats[key])]))}
        : chosen;
      const previewOnly = ownerOnly || unsaved;
      const exportURL = previewOnly ? '' : url;
      const include = find('[data-card-include]');
      include.hidden = !previewOnly;
      download.disabled = true;
      status.textContent = '';
      for(const button of page.querySelectorAll('[data-card-format]')) {
        button.setAttribute('aria-pressed',String(button.dataset.cardFormat===format));
      }
      try {
        const rendered = await buildPortfolioCard({...saved,sections:previewSections},stats,data.account.displayName,format,exportURL);
        if(activeCard!==task)return;
        card.width=rendered.width;
        card.height=rendered.height;
        card.getContext('2d').drawImage(rendered,0,0);
        card.hidden=false;
        status.textContent=ownerOnly
          ? 'Private preview. Turn on the stats you want on the card and save the sections to share them.'
          : unsaved ? 'Preview of unsaved choices. Save the sections to export this version.'
          : !url ? 'Enable link or public access to export this card with its QR.' : '';
        download.disabled=!exportURL;
        download.onclick=()=>downloadURL(card.toDataURL('image/png'),'ledgerline-'+format+'.png');
      } catch { if(activeCard===task)status.textContent='Could not render the share card.'; }
    }

    async function drawQR(url) {
      const task = {};
      activeQR = task;
      const exports = ['[data-qr-png]','[data-qr-svg]','[data-qr-print]'].map(find);
      exports.forEach(control=>control.disabled=true);
      canvas.hidden = true;
      qrStatus.textContent = '';
      if (!url) return;
      for (const control of page.querySelectorAll('[data-qr-color]')) {
        control.setAttribute('aria-pressed',String(control.dataset.qrColor===color));
      }
      try {
        const {drawInviteQr,inviteQrSvg} = await import('./streak-invite-qr.js');
        const options = {ink:qrColors[color]};
        const image = node('canvas');
        await drawInviteQr(image,url,options);
        if (activeQR!==task) return;
        canvas.width = canvas.height = 1024;
        canvas.getContext('2d').drawImage(image,0,0,1024,1024);
        canvas.hidden = false;
        exports.forEach(control=>control.disabled=false);
        find('[data-qr-png]').onclick = ()=>downloadURL(canvas.toDataURL('image/png'),'ledgerline-portfolio.png');
        find('[data-qr-svg]').onclick = async()=>{
          try {
            const svg = await inviteQrSvg(url,options);
            if (activeQR!==task) return;
            const path = URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
            downloadURL(path,'ledgerline-portfolio.svg');
            setTimeout(()=>URL.revokeObjectURL(path),30000);
          } catch { qrStatus.textContent='Could not save the SVG.'; }
        };
        find('[data-qr-print]').onclick = ()=>void printQR(canvas,url).catch(()=>{ qrStatus.textContent='Could not open the print sheet.'; });
      } catch { if (activeQR===task) qrStatus.textContent = 'Could not draw the QR. You can still copy the portfolio link.'; }
    }

    async function persist(payload) {
      if (saveInProgress) throw new Error('A save is already in progress. Try again in a moment.');
      saveInProgress = true;
      try { ({portfolio:saved}=await save(payload)); paintSharing(); }
      finally { saveInProgress=false; }
    }

    function saveVisibility(status, nextVisibility, sections) {
      return persist({action:'visibility',visibility:nextVisibility,sections}).then(()=>{
        paint();status.textContent='Sharing settings saved.';
      });
    }

    form.addEventListener('input',paint);
    find('[data-customize-profile]').onclick=async event=>{
      const control=event.currentTarget;
      control.disabled=true;
      try {
        if(!saved?.slug) {
          if(!form.reportValidity())return;
          await persist({...formValues(form),action:'customize'});
        }
        location.assign(portfolioPath(saved.slug)+'?edit=1');
      } catch(error) {
        const status=find('[data-portfolio-status]');
        status.textContent=error.message;
        status.scrollIntoView({block:'center'});
      } finally { control.disabled=false; }
    };
    const currentShareURL = () => share.hidden ? '' : find('[data-public-link]').href;
    sectionForm.addEventListener('input',()=>{
      paint();
      void drawCard(currentShareURL());
    });
    find('[data-card-include]').onclick=()=>{
      sectionForm.scrollIntoView({block:'center'});
      sectionForm.elements.adherence.focus({preventScroll:true});
    };
    for (const input of page.querySelectorAll('.pf-design-choice input')) input.addEventListener('change',paint);
    for (const control of page.querySelectorAll('[data-pf-visibility]')) control.onclick=()=>{
      visibility=control.dataset.pfVisibility;visibilityStatus.textContent='';paint();
    };
    find('[data-pf-save-visibility]').onclick=async(event)=>{
      const control=event.currentTarget;
      control.disabled=true;visibilityStatus.textContent='Saving…';
      try { await saveVisibility(visibilityStatus,visibility,Object.fromEntries(Object.keys(portfolioSections).map(key=>[key,saved?.sections?.[key]===true]))); }
      catch(error){visibilityStatus.textContent=error.message;}
      finally{control.disabled=false;}
    };
    sectionForm.onsubmit=event=>submit(event,sectionStatus,async()=>{
      await saveVisibility(sectionStatus,saved?.visibility ?? 'private',readPortfolioVisibility(formValues(sectionForm)).sections);
      return 'Portfolio sections saved.';
    });
    form.onsubmit=event=>submit(event,find('[data-portfolio-status]'),async(values)=>{
      await persist({...values,action:'customize'});
      paint();
      if(new URLSearchParams(location.search).get('return')==='portfolio')location.assign(portfolioPath(saved.slug));
      return 'Portfolio saved.';
    });
    find('[data-share-card]').onclick=()=>openPortfolioShare(saved,stats,data.account.displayName);
    for (const control of page.querySelectorAll('[data-copy-portfolio]')) control.onclick=async()=>{
      if (share.hidden) {
        find('#portfolio-visibility').scrollIntoView({block:'nearest'});
        find('[data-pf-visibility][aria-pressed=true]')?.focus({preventScroll:true});
        visibilityStatus.textContent='Save link or public access to copy a shareable link.';
        return;
      }
      const url=find('[data-public-link]').href;
      try {
        await navigator.clipboard.writeText(url);
        copyStatus.textContent='Portfolio link copied.';
        const original=control.dataset.copyLabel ??= control.textContent;
        control.textContent='Copied';
        setTimeout(()=>{ control.textContent=original; },1400);
      } catch {
        copyStatus.textContent=url;
        copyStatus.scrollIntoView({block:'nearest'});
      }
    };
    for(const control of page.querySelectorAll('[data-card-format]'))control.onclick=()=>{
      cardFormat=control.dataset.cardFormat;
      void drawCard(currentShareURL());
    };
    for (const control of page.querySelectorAll('[data-qr-color]')) control.onclick=()=>{
      color=control.dataset.qrColor;
      void drawQR(find('[data-qr-url]').textContent);
    };
    paint();
    paintSharing();
  },
};

function downloadURL(url,name) {
  const download=node('a');
  download.href=url;
  download.download=name;
  download.click();
}

async function printQR(canvas,url) {
  const sheet=node('section','','pf-print-sheet');
  const image=node('img');
  image.src=canvas.toDataURL('image/png');
  image.alt='Portfolio QR';
  await image.decode();
  sheet.append(node('h1','Ledgerline portfolio'),image,node('p',url));
  document.body.append(sheet);
  window.addEventListener('afterprint',()=>sheet.remove(),{once:true});
  window.print();
}


function buildPortfolioSheets(data, headingTag = 'h1') {
  const cover = node('section','','portfolio-sheet portfolio-cover');
  const sheets = [cover];
  const title = node(headingTag,data.displayName,'portfolio-cover-title');
  if (data.avatar) {
    const portrait = node('div','','portfolio-cover-portrait');
    portrait.setAttribute('aria-hidden','true');
    const photo = node('img');
    photo.src = avatarUrl(data.avatar);
    photo.alt = '';
    photo.onerror = () => photo.remove();
    portrait.append(node('span',Array.from(data.displayName)[0]?.toUpperCase()??'L'),photo);
    cover.append(portrait);
  }
  cover.append(title);
  if (data.headline) {
    const byline = node('p',data.headline,'portfolio-byline');
    byline.append(node('span','','portfolio-ink'));
    cover.append(byline);
  }
  const metrics = buildStats(data.sections,data.stats);
  if (metrics.length) {
    const process = node('section','','portfolio-sheet portfolio-process');
    const group = node('div','','portfolio-metrics');
    group.append(...metrics);
    process.append(node('h2','How I trade'),group);
    sheets.push(process);
  }
  if (data.about || data.badges?.length) {
    const about = node('section','','portfolio-sheet portfolio-about');
    if (data.about) about.append(node('h2','About'),node('p',data.about,'portfolio-copy'));
    if (data.badges?.length) {
      const list = node('ul');
      for (const badge of data.badges) list.append(node('li',badge.name+' · '+new Date(badge.earnedAt).toLocaleDateString()));
      about.append(node('h2','Badges'),list);
    }
    sheets.push(about);
  }
  const pageNumber = n => String(n).padStart(2,'0');
  for (const [index,sheet] of sheets.entries()) {
    const folio = node('div','','portfolio-sheet-folio portfolio-folio');
    folio.append(node('span',String(new Date().getFullYear())),node('span','Trading journal'),
      node('span',pageNumber(index+1)+' of '+pageNumber(sheets.length)));
    sheet.prepend(folio);
  }
  return {cover,sheets};
}
function buildStats(visible, data) {
  const cards = [];
  if (visible.streak) cards.push(stat('Journal streak',data.streak + (data.streak === 1 ? ' day' : ' days'),`Best ${data.best} · Level ${data.level}`));
  if (visible.adherence) cards.push(stat('Rules followed',rate(data.adherence),data.adherence === null ? 'No recorded rule checks' : 'Across recorded trade checks'));
  if (visible.reviews) cards.push(stat('Trades reviewed',String(data.reviews),'From the journal'));
  return cards;
}
