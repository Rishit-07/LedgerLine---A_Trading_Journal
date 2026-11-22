import {portfolioDesignControls} from './portfolio-design-controls.js';
import {mountPage} from './shared.js';
import {node} from './workspace-ui.js';
import {portfolioPath} from './portfolio-preferences.js';
import './portfolio-public.css';
import '@fontsource/dm-serif-display/latin-400.css';
import '@fontsource-variable/caveat';
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';

const contentFields = [
  ['cover','Cover word','Leave blank to use your name',100],
  ['location','Location','Displayed on the cover',100],
  ['markets','Markets','One market per line'],
  ['courses','Courses','One completed course per line'],
  ['tools','Tools','One tool per line'],
  ['rules','Rules I follow','One rule per line'],
  ['books','Books','One title per line'],
  ['playbookTitle','Playbook title','Leave blank to use Playbook',100],
  ['playbook','Playbook','Add up to five setups, one per line: Setup name | Rules | Reflection. Match the setup name in your journal to show its stats. Separate rules with semicolons.'],
  ['lessons','Lessons','One lesson per line'],
  ['closing','Closing note','A short note for visitors'],
];
function addOwnerActions(page, slug, data) {
  const nav = node('nav', '', 'portfolio-owner-actions');
  nav.setAttribute('aria-label','Manage portfolio');
  const customize = node('button','Customize','n-btn');
  customize.type = 'button';
  customize.setAttribute('aria-haspopup','dialog');
  nav.append(customize);
  const drawer = node('dialog','','mgn-customize');
  drawer.setAttribute('aria-labelledby','portfolio-customize-title');
  const head = node('header');
  const title = node('h2','Your portfolio','mgn-display');
  title.id = 'portfolio-customize-title';
  const close = node('button','Close','mgn-customize-secondary');
  close.type = 'button';
  close.onclick = () => drawer.close();
  head.append(title,close);
  const form = node('form');
  const fields = [
    ['displayName','Display name','',100,data.displayName],
    ['headline','Headline','',120,data.headline],
    ['about','About','Use brackets to circle text and asterisks to underline it.',1000,data.about],
    ...contentFields.filter(([key])=>key!=='playbook').map(([key,label,help,limit=1500]) => [key,label,help,limit,data.sections?.content?.[key]]),
  ];
  const extra=node('details','','portfolio-setup-copy');
  extra.append(node('summary','More profile sections'));
  for (const [key,label,help,max,value] of fields) {
    const field = node('div','','mgn-customize-field');
    const caption = node('label',label);
    const control = node(max > 120 ? 'textarea' : 'input');
    control.id = 'portfolio-edit-' + key;
    caption.htmlFor = control.id;
    control.name = key;
    control.maxLength = max;
    control.value = value ?? '';
    control.required = key === 'displayName';
    if (control.tagName === 'TEXTAREA') control.rows = 3;
    field.append(caption,control);
    if (help) {
      const detail = node('small',help);
      detail.id = control.id + '-help';
      control.setAttribute('aria-describedby',detail.id);
      field.append(detail);
    }
    if (!control.required) {
      const clear = node('button','Remove ' + label.toLowerCase(),'mgn-customize-remove');
      clear.type = 'button';
      clear.hidden = !control.value;
      control.oninput = () => { clear.hidden = !control.value; };
      clear.onclick = () => { control.value = ''; clear.hidden = true; control.focus(); };
      field.append(clear);
    }
    (['displayName','headline','cover','about','playbookTitle'].includes(key)?form:extra).append(field);
  }
  form.append(extra);
  const design=portfolioDesignControls(form,data);
  form.prepend(form.querySelector('.portfolio-choices'));
  const actions = node('div','','mgn-customize-actions');
  const save = node('button','Apply and replay','mgn-customize-save');
  save.type = 'submit';
  actions.append(save);
  const reset=node('button','Reset edits','mgn-customize-secondary');
  reset.type='button';reset.onclick=()=>{const url=new URL(location.href);url.searchParams.set('edit','1');location.replace(url);};
  actions.append(reset);
  const links = [['Manage badges','/badges'],['Sharing and stats','/portfolio'],['Settings','/settings#portfolio']];
  if (data.visibility !== 'private') links.push(['View as visitor',portfolioPath(slug) + '?view=visitor']);
  for (const [label,href] of links) {
    const link = node('a', label, 'n-btn');
    link.href = href;
    actions.append(link);
  }
  const status = node('p');
  status.setAttribute('role','status');
  const share = node('label','','mgn-setup-consent');
  const toggle = node('input');
  toggle.type = 'checkbox';
  toggle.checked = data.sections?.setupStats === true;
  share.append(toggle,'Share setup stats from my journal');
  form.append(share,actions,status);
  form.onsubmit = async event => {
    event.preventDefault();
    save.disabled = true;
    status.textContent = 'Saving…';
    const values = Object.fromEntries(new FormData(form));
    const content = Object.fromEntries(contentFields.map(([key]) => [key,values[key]]));
    try {
      const presentation=design.read();
      content.playbook=presentation.setups.map(s=>s.name).join('\n');
      const {auth} = await import('../firebase-session.js');
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/workspace?page=portfolio',{
        method:'POST',headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json'},
        body:JSON.stringify({action:'customize',displayName:values.displayName,headline:values.headline,about:values.about,design:presentation.theme==='sage'?'marginalia':presentation.theme,presentation,content,setupStats:toggle.checked}),
        signal:AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      location.reload();
    } catch (error) {
      status.textContent = error.message || 'Could not save the portfolio. Try again.';
      save.disabled = false;
    }
  };
  drawer.append(head,form);
  customize.onclick = () => drawer.showModal();
  page.append(nav,drawer);
  page.addEventListener('portfolio-edit', event => {
    drawer.showModal();
    if(String(event.detail).startsWith('setup:')){design.focus(Number(event.detail.slice(6)));return;}
    const input = form.elements.namedItem(event.detail);
    if(input?.closest('details'))input.closest('details').open=true;
    input?.focus();
  });
  const entryURL = new URL(location.href);
  if (entryURL.searchParams.get('edit') === '1') {
    drawer.showModal();
    entryURL.searchParams.delete('edit');
    history.replaceState(history.state,'',entryURL);
  }
}

export async function renderPublicPortfolio(landing, slug) {
  const robots = node('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow';
  document.head.append(robots);
  const page = mountPage(landing,'<main class="n-root portfolio-page"><p class="portfolio-load" role="status">Loading portfolio…</p></main>');
  const status = page.firstChild;
  try {
    const visitor = new URLSearchParams(location.search).get('view') === 'visitor';
    const [owner, publicResult] = await Promise.all([
      visitor ? null : loadOwnedPortfolio(slug),
      fetch('/api/portfolio/public?' + new URLSearchParams({slug}), {signal:AbortSignal.timeout(10000)}).catch(() => null),
    ]);
    if (!owner && !publicResult?.ok) throw new Error(publicResult?.status === 404 ? 'This portfolio is private or unavailable.' : 'Could not load this portfolio.');
    const data = owner ?? await publicResult.json();
    if (data.visibility === 'public') robots.remove();
    document.title = data.displayName + ' · Ledgerline portfolio';
    page.dataset.design = data.sections?.presentation?.theme || data.design;
    const url = data.visibility === 'private' ? '' : new URL(portfolioPath(slug),location.origin).href;
    const [{createRoot},{createElement},{MarginaliaPortfolioTemplate},{marginaliaProps}] = await Promise.all([
      import('react-dom/client'), import('react'), import('./marginalia/template.js'), import('./marginalia/props.js'),
    ]);
    const host = node('div','','portfolio-template');
    page.append(host);
    createRoot(host).render(createElement(MarginaliaPortfolioTemplate, marginaliaProps(data,{url,owner:!!owner})));
    status.remove();
    if (owner) addOwnerActions(page, slug, data);
  } catch (error) { status.textContent = error.message; }
}

async function loadOwnedPortfolio(slug) {
  try {
    const {auth} = await import('../firebase-session.js');
    await auth.authStateReady();
    if (!auth.currentUser?.emailVerified) return null;
    const token = await auth.currentUser.getIdToken();
    const response = await fetch('/api/workspace?page=portfolio',{headers:{Authorization:'Bearer ' + token},signal:AbortSignal.timeout(5000)});
    if (!response.ok) return null;
    const {portfolio,account,stats,badges,avatar,setupStats} = await response.json();
    if (portfolio?.slug !== slug) return null;
    return {...portfolio,avatar:portfolio.sections?.photo ? avatar : null,displayName:portfolio.displayName || account.displayName,
      stats:{...stats,streak:account.streak,best:account.best,level:account.level},badges,setupStats};
  } catch { return null; }
}
