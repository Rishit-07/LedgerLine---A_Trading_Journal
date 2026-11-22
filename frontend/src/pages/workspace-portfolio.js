import { bindPublicAccount } from './public-account.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { mountPage } from './shared.js';
import { node, select, stat, rate, submit, formValues } from './workspace-ui.js';
import './portfolio-public.css';
import './workspace.css';
import '@fontsource/instrument-serif/latin-400.css';

const sections = { streak: 'Journal streak', adherence: 'Rules followed', reviews: 'Trades reviewed' };
const defaultSections = { streak:true, adherence:true, reviews:true };
const portfolioPath = (slug) => '/p/' + encodeURIComponent(slug);

export const portfolio = {
  title:'Portfolio', description:'Build it once, share it as a card, link or QR.',
  content:`<div class="ws-notice"><strong>What goes public</strong><p>Your selected process metrics and the profile copy you write. Journal notes, account size, returns and traded instruments stay private.</p></div>
    <div class="ws-columns community-portfolio">
      <section class="n-out ws-card"><h2>Build your portfolio</h2>
        <form class="ws-form" data-portfolio-form>
          <label>Who can see it<select name="visibility"><option value="private">Private</option><option value="link">Anyone with the link</option><option value="public">Public</option></select></label>
          <h3>Profile</h3><label>Public display name<input name="displayName" maxlength="100"></label>
          <label>Headline<input name="headline" maxlength="120"></label>
          <label>About<textarea name="about" rows="4" maxlength="1000"></textarea></label>

          <fieldset><legend>What it shows</legend>
            ${Object.entries(sections).map(([key,label]) => `<label class="ws-check"><input type="checkbox" name="${key}" checked>${label}</label>`).join('')}
          </fieldset>
          <fieldset class="ws-themes"><legend>Portfolio design</legend>
            <label><input type="radio" name="design" value="marginalia" checked><span>Marginalia</span></label>
            <label><input type="radio" name="design" value="terracotta"><span>Terracotta</span></label>
            <label><input type="radio" name="design" value="dashboard"><span>Indigo</span></label>
          </fieldset>
          <button class="n-btn n-acc dash-button">Save portfolio</button>
        </form>
        <p role="status" data-portfolio-status></p>
      </section>
      <section class="n-out ws-card ws-preview-card"><div class="ws-section-head"><h2>Portfolio preview</h2><small data-preview-visibility></small></div><div data-portfolio-preview></div>
        <div class="ws-actions" data-portfolio-share hidden>
          <a class="n-btn n-out dash-button" data-public-link target="_blank" rel="noopener">Open shared portfolio</a>
          <button class="n-btn n-out dash-button" data-copy-portfolio type="button">Copy link</button>
          <button class="n-btn n-out dash-button" data-portfolio-qr type="button" aria-expanded="false" aria-controls="portfolio-qr">Show QR</button>
        </div>
        <canvas id="portfolio-qr" class="ws-portfolio-qr" role="img" aria-label="Shared portfolio QR code" hidden></canvas>
        <p role="status" data-portfolio-copy-status></p>
      </section>
    </div>`,
  bind(page, { data, save }) {
    const form = select(page,'[data-portfolio-form]');
    let saved = data.portfolio;
    const status = select(page,'[data-portfolio-status]');
    const share = select(page,'[data-portfolio-share]');
    const link = select(page,'[data-public-link]');
    const canvas = select(page,'#portfolio-qr');
    const qr = select(page,'[data-portfolio-qr]');
    const preview = select(page,'[data-portfolio-preview]');
    const copyStatus = select(page,'[data-portfolio-copy-status]');
    const stats = { ...data.stats, streak:data.account.streak, best:data.account.best, level:data.account.level };
    function draft(values) {
      return { displayName:values.displayName, headline:values.headline, about:values.about, design:values.design,
        visibility:values.visibility, sections:Object.fromEntries(Object.keys(sections).map((key) => [key,Boolean(values[key])])) };
    }
    function paintPreview() {
      const value = draft(formValues(form));
      const card = node('article','','portfolio-preview');
      card.dataset.design = value.design;
      select(page,'[data-preview-visibility]').textContent=form.elements.visibility.selectedOptions[0].textContent;
      card.append(node('small','TRADING JOURNAL'),node('h3',value.displayName.trim() || data.account.displayName),
        node('p',value.headline),node('p',value.about), ...buildStats(value.sections, stats));
      if(value.visibility!=='private'&&data.badges?.length){
        const list=node('ul');
        for(const badge of data.badges)list.append(node('li',badge.name+' · '+new Date(badge.earnedAt).toLocaleDateString()));
        card.append(node('h4','Badges'),list);
      }
      preview.replaceChildren(card);
    }
    function paintSharing() {
      share.hidden = !saved?.slug || saved.visibility === 'private';
      canvas.hidden = true;
      qr.textContent = 'Show QR';
      qr.setAttribute('aria-expanded','false');
      if (!share.hidden) link.href = portfolioPath(saved.slug);
      copyStatus.textContent = '';
    }
    form.elements.displayName.value = saved?.displayName || data.account.displayName;
    form.elements.headline.value = saved?.headline ?? '';
    form.elements.about.value = saved?.about ?? '';
    form.elements.visibility.value = saved?.visibility ?? 'private';
    form.elements.design.value = saved?.design ?? 'marginalia';
    for (const key of Object.keys(sections)) form.elements[key].checked = (saved?.sections ?? defaultSections)[key];
    paintPreview();
    paintSharing();
    form.addEventListener('input',paintPreview);
    form.addEventListener('submit',(event) => submit(event,status,async (values) => {
      ({ portfolio:saved } = await save(draft(values)));
      paintSharing();
      return 'Portfolio saved.';
    }));
    select(page,'[data-copy-portfolio]').addEventListener('click',async () => {
      try { await navigator.clipboard.writeText(link.href); copyStatus.textContent = 'Portfolio link copied.'; }
      catch { copyStatus.textContent = link.href; }
    });
    qr.addEventListener('click',async () => {
      if (!canvas.hidden) {
        canvas.hidden = true; qr.textContent = 'Show QR'; qr.setAttribute('aria-expanded','false'); return;
      }
      qr.disabled = true;
      try {
        const url = link.href;
        const { default:QRCode } = await import('qrcode');
        await QRCode.toCanvas(canvas,url,{scale:6,margin:4});
        if (!share.hidden && link.href === url) {
          canvas.hidden = false; qr.textContent = 'Hide QR'; qr.setAttribute('aria-expanded','true');
        }
      } catch { copyStatus.textContent = 'Could not draw the QR. You can still copy the link.'; }
      finally { qr.disabled = false; }
    });
  },
};

function buildStats(visible, data) {
  const cards = [];
  if (visible.streak) cards.push(stat('Journal streak',data.streak + (data.streak === 1 ? ' day' : ' days'),`Best ${data.best} · Level ${data.level}`));
  if (visible.adherence) cards.push(stat('Rules followed',rate(data.adherence),data.adherence === null ? 'No recorded rule checks' : 'Across recorded trade checks'));
  if (visible.reviews) cards.push(stat('Trades reviewed',String(data.reviews),'From the journal'));
  return cards;
}

export async function renderPublicPortfolio(landing, slug) {
  const robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow';
  document.head.append(robots);
  const page = mountPage(landing,`<main class="n-root portfolio-public">
    <header class="portfolio-nav"><a href="/"><img src="/ledgerline-icon.svg" width="24" height="24" alt=""> Ledgerline</a></header>
    <p class="portfolio-load" role="status">Loading portfolio…</p>
  </main>`);
  bindPublicAccount(page);
  const status = select(page,'.portfolio-load');
  try {
    const response = await fetch('/api/portfolio/public?' + new URLSearchParams({slug}),{signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error(response.status === 404 ? 'This portfolio is private or unavailable.' : 'Could not load this portfolio.');
    const data = await response.json();
    if (data.visibility === 'public') robots.remove();
    document.title = data.displayName + ' · Ledgerline portfolio';
    page.dataset.design = data.design;
    const cover = node('section','','portfolio-sheet portfolio-cover');
    cover.append(node('p','THE TRADING JOURNAL','portfolio-folio'),node('h1',data.displayName));
    if (data.headline) {
      const byline = node('p',data.headline,'portfolio-byline');
      byline.append(node('span','','portfolio-ink'));
      cover.append(byline);
    }
    const metrics = buildStats(data.sections,data.stats);
    if (data.about || metrics.length || data.badges?.length) cover.append(node('span','Scroll to explore ↓','portfolio-scroll'));
    page.append(cover);
    if (data.about) {
      const about = node('section','','portfolio-sheet portfolio-about');
      about.append(node('p','IN MY OWN WORDS','portfolio-folio'),node('h2','The work behind the trades'),node('p',data.about,'portfolio-copy'));
      page.append(about);
    }
    if (metrics.length) {
      const process = node('section','','portfolio-sheet portfolio-process');
      const group = node('div','','portfolio-metrics');
      group.append(...metrics);
      process.append(node('p','FROM THE JOURNAL','portfolio-folio'),node('h2','The process record'),group);
      page.append(process);
    }
    if(data.badges?.length){
      const badges=node('section','','portfolio-sheet portfolio-about'),list=node('ul');
      badges.append(node('h2','Badges'),list);
      for(const badge of data.badges)list.append(node('li',badge.name+' · '+new Date(badge.earnedAt).toLocaleDateString()));
      page.append(badges);
    }
    const end = node('footer','Made with Ledgerline','portfolio-footer');
    page.append(end);
    status.remove();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.registerPlugin(ScrollTrigger);
      const heading = cover.querySelector('h1');
      heading.setAttribute('aria-label',data.displayName);
      heading.replaceChildren(...data.displayName.split(/\s+/).map((word) => {
        const wrapper = node('span','','portfolio-word');
        wrapper.setAttribute('aria-hidden','true');
        wrapper.append(...Array.from(word,(letter) => node('span',letter,'portfolio-letter')));
        return wrapper;
      }));
      gsap.timeline().from(cover.querySelectorAll('.portfolio-letter'),{yPercent:110,rotate:7,duration:.9,stagger:.025,ease:'expo.out'})
        .from(cover.querySelectorAll('p,.portfolio-scroll'),{y:16,opacity:0,duration:.45,stagger:.08},'-.55')
        .from(cover.querySelectorAll('.portfolio-ink'),{scaleX:0,duration:.6,ease:'power2.out'},'-.3');
      for (const sheet of page.querySelectorAll('.portfolio-about,.portfolio-process')) {
        gsap.from(sheet.children,{scrollTrigger:{trigger:sheet,start:'top 80%',once:true},y:32,opacity:0,duration:.8,stagger:.12,ease:'power3.out'});
      }
      const process = page.querySelector('.portfolio-process');
      if (process) gsap.from(process,{
        clipPath:'inset(0 6% 0 round 42px)',ease:'none',
        scrollTrigger:{trigger:process,start:'top 88%',end:'top 33%',scrub:.35},
      });
    }
  } catch (error) { status.textContent = error.message; }
}
