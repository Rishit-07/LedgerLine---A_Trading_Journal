import {portfolioSetups} from '../../../src/config/portfolio.js';
import {portfolioDesignControls} from './portfolio-design-controls.js';
import {medal} from './badge-shelf.js';
// Adapted from Marginalia Portfolio Template, Copyright (c) Kedhareswer Naidu (MIT).
import {mountPage} from './shared.js';
import {formatDate, node} from './workspace-ui.js';
import {avatarUrl} from './profile-picture.js';
import {portfolioPath} from './portfolio-preferences.js';
import {bindPortfolioMotion} from './portfolio-motion.js';
import './portfolio-public.css';
import '@fontsource/dm-serif-display/latin-400.css';
import '@fontsource-variable/caveat';
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';

const journal = 'Trading Journal';
const year = String(new Date().getFullYear());
const svgNS = 'http://www.w3.org/2000/svg';
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
const lines = value => String(value ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);

function graphic(tag, attributes) {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function ink(viewBox, paths, className = 'mgn-ink') {
  const svg = graphic('svg', {viewBox, class:className, 'aria-hidden':'true'});
  for (const d of paths) svg.append(graphic('path', {d, class:'mgn-draw', pathLength:1}));
  return svg;
}

function oval() {
  const mark = ink('0 0 180 56', ['M146 7C92-5 13 5 6 26C-3 53 101 63 155 46C191 35 182 14 161 8'], 'mgn-mark mgn-oval');
  mark.setAttribute('preserveAspectRatio', 'none');
  return mark;
}

function sheet(name, label, tone = 'paper') {
  const section = node('section', '', 'mgn-sheet');
  section.id = 'portfolio-' + name;
  section.dataset.label = label;
  section.dataset.tone = tone;
  if (tone === 'night') section.append(node('div', '', 'mgn-sheet-bg'));
  section.append(node('div', '', 'mgn-grain'));
  return section;
}

function splitText(text, outer, inner) {
  return text.split(/(\s+)/).filter(Boolean).map(word => {
    if (!word.trim()) return document.createTextNode(' ');
    const group = node('span', '', 'mgn-w');
    group.setAttribute('aria-hidden', 'true');
    for (const letter of Array.from(word)) {
      const mask = node('span', '', outer);
      mask.append(node('span', letter, inner));
      if (outer === 'mgn-lc') {
        const character = node('span', '', 'mgn-l');
        character.append(mask);
        group.append(character);
      } else group.append(mask);
    }
    return group;
  });
}

function heading(label) {
  const group = node('div', '', 'mgn-hd');
  const title = node('h2', '', 'mgn-display mgn-h2');
  title.setAttribute('aria-label', label);
  title.append(...splitText(label, 'mgn-c', 'mgn-ci'));
  const underline = ink('0 0 300 26', ['M4 18 C54 10 116 11 157 12 S237 7 295 9'], 'mgn-uline');
  underline.firstChild.dataset.rough = 'M4 18 C40 9 60 5 91 19 S151 7 182 14 S250 6 295 9';
  group.append(title, underline);
  return group;
}

function coverSheet(data, details) {
  const cover = sheet('cover', 'Cover');
  cover.classList.add('mgn-cover');
  const trail = node('canvas', '', 'mgn-canvas');
  trail.setAttribute('aria-hidden', 'true');
  const content = node('div', '', 'mgn-cover-in');
  const title = node('h1', '', 'mgn-display mgn-title');
  const coverWord = details.cover || data.displayName;
  title.setAttribute('aria-label', coverWord);
  const longest = Math.max(...coverWord.split(/\s+/).map(word => Array.from(word).length));
  title.style.setProperty('--name-size', Math.min(21.5, 146 / Math.max(1, longest)) + 'cqi');
  title.append(...splitText(coverWord, 'mgn-lc', 'mgn-li'));
  const letters = [...title.querySelectorAll('.mgn-l')];
  const orbitLetter = letters.findLast(letter => letter.textContent.toLowerCase() === 'o') ?? letters.at(-1);
  const orbit = node('span', '', 'mgn-orbit');
  const back = ink('-100 -100 200 200', ['M-92 0A92 30 0 0 1 92 0'], 'mgn-orbit-back mgn-ink');
  const front = ink('-100 -100 200 200', ['M92 0A92 30 0 0 1 -92 0']);
  for (const ring of [back, front]) ring.firstChild.setAttribute('transform', 'rotate(-18)');
  const star = graphic('g', {class:'mgn-star-g', transform:'translate(54 8)'});
  const starShape = graphic('g', {class:'mgn-star-s'});
  starShape.append(graphic('path', {class:'mgn-star-path', d:'M0-13 Q2-2 13 0 Q2 2 0 13 Q-2 2-13 0 Q-2-2 0-13Z'}));
  star.append(starShape);
  front.append(star);
  orbit.append(back, front);
  orbitLetter?.append(orbit);
  const signature = node('span', '', 'mgn-sig mgn-hand');
  signature.setAttribute('aria-hidden', 'true');
  signature.append(ink('0 0 150 110', [
    'M146 14C128 34 104 30 101 17C98 4 120 2 117 24C114 48 70 74 24 96',
    'M30 80L22 97L41 99',
  ], 'mgn-sig-arrow mgn-ink'), node('span', data.displayName, 'mgn-write'));
  content.append(title, signature);
  if (data.headline) {
    const wrap = node('div', '', 'mgn-pill-wrap');
    const pill = node('span', data.headline, 'mgn-pill');
    pill.append(oval());
    wrap.append(pill);
    content.append(wrap);
  }
  const meta = node('div', '', 'mgn-cover-meta');
  const hint = node('button', 'scroll', 'mgn-hint');
  hint.append(ink('0 0 22 40', ['M11 2c-6 6 6 10 0 16s6 10 0 18','M5 31l6 7 6-7']));
  meta.append(node('span', [details.location, year].filter(Boolean).join(' — ')), hint, node('span', journal));
  cover.append(trail, content, meta);
  return cover;
}

function helloSheet(data) {
  const section = sheet('hello', 'Hello');
  const layout = node('div', '', 'mgn-two');
  const frame = node('div', '', 'mgn-traits');
  const portrait = node('div', '', 'mgn-portrait');
  const picture = node('div', '', 'mgn-portrait-img');
  picture.append(node('span', Array.from(data.displayName)[0]?.toUpperCase() ?? 'L', 'mgn-monogram'));
  if (data.sections?.photo && data.avatar) {
    const image = node('img');
    image.src = avatarUrl(data.avatar);
    image.alt = data.displayName;
    image.loading = 'lazy';
    image.onerror = () => image.remove();
    picture.append(image);
  }
  const annotation = ink('0 0 500 520', [
    'M124 70q48-8 51 49m-11-13 11 13 8-15',
    'M390 452q-22 5-44-41m-1 13 1-13 13 5',
  ]);
  annotation.classList.add('mgn-portrait-notes');
  portrait.append(picture, ink('0 0 120 180', ['M1 1 118 4 120 178 3 176Z','M-2 7 115-1 117 181 0 179Z'], 'mgn-mark mgn-portrait-mark'));
  frame.append(portrait, annotation);
  frame.dataset.ink = '';
  const intro = node('div', '', 'mgn-hello-copy');
  intro.append(heading('Hello.'));
  if (data.about) {
    const bio = node('p', '', 'mgn-p mgn-bio');
    for (const part of data.about.split(/(\[[^\[\]\n]+\]|\*[^*\n]+\*)/g)) {
      if (part.startsWith('[') && part.endsWith(']')) {
        const marked = node('span', part.slice(1,-1), 'mgn-mk');
        marked.append(oval());
        bio.append(marked);
      } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        const marked = node('span', part.slice(1,-1), 'mgn-mk');
        marked.append(ink('0 0 180 14', ['M2 8q90-11 176 0'], 'mgn-mark mgn-bio-mark'));
        bio.append(marked);
      } else bio.append(part);
    }
    bio.dataset.ink = '';
    intro.append(bio);
  }
  layout.append(frame, intro);
  section.append(layout);
  return section;
}

function processSheet(sections, stats) {
  const metrics = [
    ['streak', 'Journal streak', ' days', Number.isFinite(stats.best) && Number.isFinite(stats.level) ? 'Best ' + stats.best + ' · Level ' + stats.level : ''],
    ['adherence', 'Rules followed', '%', 'Across recorded trade checks'],
    ['reviews', 'Trades reviewed', '', 'From the journal'],
  ].filter(([key]) => sections[key] === true && Number.isFinite(stats[key]));
  if (!metrics.length) return null;
  const process = sheet('process', 'Process', 'night');
  const layout = node('div', '', 'mgn-process');
  const group = node('dl', '', 'mgn-process-metrics');
  for (const [key, label, suffix, detail] of metrics) {
    const item = node('div', '', 'mgn-process-metric');
    item.dataset.rise = '';
    const description = node('dd');
    const value = node('span', '', 'mgn-stat-n mgn-hand mgn-mk');
    const count = node('span', String(stats[key]), 'mgn-count');
    count.dataset.value = String(stats[key]);
    value.append(count, key === 'streak' && stats[key] === 1 ? ' day' : suffix, oval());
    value.dataset.ink = '';
    description.append(value, node('span', detail, 'mgn-stat-l'));
    item.append(node('dt', label), description);
    group.append(item);
  }
  layout.append(heading('Process'),group);
  process.append(layout);
  return process;
}

function educationSheet(data, content) {
  const courses = data.sections?.presentation?.hidden?.includes('education') ? [] : lines(content.courses);
  const markets = lines(content.markets);
  const badges = data.sections?.presentation?.hidden?.includes('education') ? [] : data.badges ?? [];
  if (!badges.length && !courses.length && !markets.length) return null;
  const label = badges.length || courses.length ? 'Badges' : 'Markets';
  const panel = sheet('education',label);
  const layout = node('div', '', 'mgn-edu');
  const text = node('div');
  text.append(heading(label));
  if (badges.length || courses.length) {
    const list = node('ul', '', 'mgn-edu-list');
    const entries = [
      ...badges.map(badge => [badge.name, 'Issued by Ledgerline · ' + formatDate(badge.earnedAt)]),
      ...courses.map(course => [course,'Self-reported course']),
    ];
    for (const [index, [name, detail]] of entries.entries()) {
      const row = node('li');
      row.dataset.rise = '';
      const details = node('div');
      const title = node('div', name, 'mgn-edu-t');
      if (index === 0) {
        title.classList.add('mgn-mk');
        title.dataset.ink = '';
        title.append(oval());
      }
      details.append(title, node('div', detail, 'mgn-edu-s'));
      const earned=badges[index];
      if(earned?.iconPath) row.append(medal(earned));
      if(earned?.shared===false) details.append(node('small','Only visible to you'));
      row.append(details);
      list.append(row);
    }
    text.append(list);
  }
  layout.append(text);
  if (markets.length) {
    const marketList = node('div','', 'mgn-detail-list');
    if (label !== 'Markets') marketList.append(node('h3','Markets','mgn-display'));
    for (const market of markets) marketList.append(node('p',market,'mgn-p'));
    layout.append(marketList);
  }
  panel.append(layout);
  return panel;
}

function skillsSheet(content) {
  const groups = [['Tools',lines(content.tools)],['Rules I follow',lines(content.rules)],['Books',lines(content.books)]]
    .filter(([, entries]) => entries.length);
  if (!groups.length) return null;
  const panel = sheet('skills','Skills');
  const layout = node('div','','mgn-process');
  const lists = node('div','','mgn-skills-grid');
  for (const [label, entries] of groups) {
    const column = node('div','','mgn-detail-list');
    const list = node('ul');
    column.dataset.rise = '';
    list.append(...entries.map(entry => node('li',entry)));
    column.append(node('h3',label,'mgn-display'), list);
    lists.append(column);
  }
  layout.append(heading('Skills'),lists);
  panel.append(layout);
  return panel;
}

const handsetViews = ['Setup','Rules','Log'];

function setupPhone(kind, setup, index, stats, design={}) {
  const phone = node('div','','mgn-setup-phone');
  const [name,rule,reflection] = setup;
  phone.dataset.chart=design.chart || 'columns';
  phone.style.setProperty('--screen-pen',design.color || ['#5b6ee1','#17724a','#c75a1b','#7a3fe0','#c4284d'][index % 5]);
  const screen = node('div','','mgn-phone-screen');
  const status = node('div','','mgn-phone-status');
  status.setAttribute('aria-hidden','true');
  status.append(node('span','Ledgerline'),node('i'));
  const body = node('div','','mgn-phone-content');
  body.append(node('small',kind === 'Rules' ? 'My rules' : kind === 'Log' ? 'Session log' : 'Setup'),
    node('strong',name,'mgn-phone-title'));
  const sessions = stats?.sessions ?? [];
  const measured = Number.isFinite(stats?.adherence);
  if (kind === 'Setup' || kind === 'Log') {
    if (kind === 'Setup' && rule) body.append(node('p',rule));
    if (kind === 'Log' && stats) {
      const metrics = node('div','','mgn-phone-metrics');
      if (measured) {
        const ring = node('span',stats.adherence+'%','mgn-phone-ring');
        ring.style.setProperty('--filled',stats.adherence+'%');
        ring.title = 'Rules followed across all logged trades for this setup';
        metrics.append(ring);
      }
      metrics.append(node('b',stats.logged+' logged'));
      body.append(metrics);
    }
    const chart = node('div','','mgn-phone-chart');
    if (sessions.length) {
      chart.append(node('small','Recent sessions'));
      const bars = node('div','','mgn-phone-bars');
      const max = Math.max(...sessions.map(s => s.logged));
      for (const session of sessions) {
        const column = node('div');
        const bar = node('i');
        bar.style.setProperty('--bar-size',(session.logged / max * 100)+'%');
        column.title = session.day+' · '+session.logged+' logged';
        const weekday = new Date(session.day+'T12:00:00Z').toLocaleDateString('en',{weekday:'narrow',timeZone:'UTC'});
        column.append(bar,node('span',weekday));
        bars.append(column);
      }
      if (design.chart==='line') {
        const plot=graphic('svg',{viewBox:'0 0 100 48',class:'mgn-session-line','aria-label':'Trades per session'});
        const points=sessions.map((day,i)=>[sessions.length===1?50:4+92*i/(sessions.length-1),44-40*day.logged/max]);
        plot.append(graphic('polyline',{points:points.map(point=>point.join(',')).join(' '),fill:'none',stroke:'currentColor','stroke-width':2}));
        points.forEach(([cx,cy])=>plot.append(graphic('circle',{cx,cy,r:2.5,fill:'currentColor'})));
        chart.append(plot);
      } else chart.append(bars);
      chart.append(node('span','Trades per session'));
    } else chart.append(node('span',stats ? 'No sessions logged yet' : 'Session stats are private'));
    body.append(chart);
    if (kind === 'Setup' && stats) {
      const chips = node('div','','mgn-phone-chips');
      if (measured) chips.append(node('b',stats.adherence+'% followed'));
      chips.append(node('b',stats.logged+' logged'));
      body.append(chips);
    }
  } else {
    const rules = (design.checks || rule).split(/[;\n]/).map(s=>s.trim()).filter(Boolean);
    for (const item of rules.slice(0,4)) {
      const row = node('div','','mgn-phone-rule');
      row.append(node('i','✓'),node('span',item));
      body.append(row);
    }
    if (!rules.length) body.append(node('p','No published rules yet'));
    if (measured) {
      body.append(node('p','Rules followed · '+stats.adherence+'%'));
      const meter = node('progress');
      meter.max = 100;
      meter.value = stats.adherence;
      meter.setAttribute('aria-label','Rules followed');
      body.append(meter);
    }
  }
  if (reflection) {
    const note = node('div','','mgn-phone-note');
    note.append(node('small','From my journal'),node('p',reflection));
    body.append(note);
  }
  const tabs = node('div','','mgn-phone-tabs');
  for (const view of handsetViews) tabs.append(node('i','',kind === view ? 'selected' : ''));
  screen.append(status,node('span','','mgn-phone-camera'),body,tabs);
  phone.append(screen);
  return phone;
}

function playbookSheets(content, setupStats, sections, owner) {
  const setups=portfolioSetups(sections ?? {});
  if(!setups.length && !owner)return [];
  const label = content.playbookTitle || 'Playbook';
  const playbook = sheet('playbook',label,'night');
  playbook.classList.add('mgn-deal');
  const stage = node('div','','mgn-deal-stage');
  const row = node('div','','mgn-row');
  const entries = Array.from({length:owner?Math.max(3,setups.length):setups.length},(_,index) => {
    const item=setups[index];
    const {name='Setup '+(index+1),rule='',note:reflection=''}=item || {};
    const number = String(index + 1).padStart(2,'0');
    const entry = sheet('setup-' + number,name,index % 2 === 0 ? 'night' : 'paper');
    const layout = node('div','','mgn-setup-layout');
    const phones = node('div','','mgn-setup-phones');
    const stats = setupStats?.find(result => result.name === name);
    const setup = [name,rule,reflection];
    const switches = node('div','','mgn-phone-switches');
    switches.setAttribute('role','group');
    switches.setAttribute('aria-label','Phone screens for '+name);
    const slots = handsetViews.map((view,slot) => {
      const slotFrame = node('div','','mgn-phone-slot');
      slotFrame.dataset.slot = String(slot);
      phones.append(slotFrame);
      const button = node('button',view);
      button.type = 'button';
      button.onclick = () => focusPhone(slot);
      switches.append(button);
      return slotFrame;
    });
    const devices = handsetViews.map(view => setupPhone(view,setup,index,stats,item));
    function focusPhone(active) {
      slots.forEach((frame,offset) => {
        frame.replaceChildren(devices[(active+offset)%devices.length]);
        frame.setAttribute('aria-hidden',String(offset !== 0));
      });
      [...switches.children].forEach((button,i) => button.setAttribute('aria-pressed',String(i === active)));
    }
    focusPhone(index % handsetViews.length);
    const copy = node('div');
    copy.append(node('span','Setup '+number,'mgn-hand mgn-setup-eyebrow'));
    copy.append(heading(name));
    for (const note of [rule,item?.how,item?.hard && 'Hardest part · '+item.hard,reflection].filter(Boolean)) {
      const body = node('p',note,'mgn-p mgn-bio');
      body.dataset.rise = '';
      copy.append(body);
    }
    if (stats) {
      const metrics = node('div','','mgn-case-stats');
      for (const [value,suffix,label] of [[stats.adherence,'%','rules followed'],[stats.logged,'','times journaled']]) {
        if (!Number.isFinite(value)) continue;
        const figure = node('span','','mgn-hand mgn-mk');
        const count = node('span',String(value),'mgn-count');
        count.dataset.value = String(value);
        figure.append(count,suffix,oval());
        const group = node('div');
        group.append(figure,node('small',label));
        metrics.append(group);
      }
      copy.append(metrics);
    }
    if(owner){
      const edit=node('button',item?'Edit setup':'Add setup','mgn-section-action');edit.type='button';
      edit.onclick=()=>entry.dispatchEvent(new CustomEvent('portfolio-edit',{bubbles:true,detail:'setup:'+index}));
      copy.append(edit);
    }
    if(!item) copy.append(node('small','Only visible to you until you publish this setup.'));
    const gallery = node('div');
    gallery.append(phones,switches);
    layout.append(copy,gallery);
    entry.append(layout);
    const card = node('button','','mgn-card');
    const thumbnail = setupPhone('Setup',setup,index,stats,item);
    thumbnail.setAttribute('aria-hidden','true');
    card.append(thumbnail,node('span',item?.tag || name,'mgn-card-label mgn-hand'));
    card.onclick = () => requestJump(entry);
    row.append(card);
    return entry;
  });
  stage.append(heading(label),row);
  playbook.append(stage);
  return [playbook,...entries];
}

function lessonsSheet(content) {
  const lessons = lines(content.lessons);
  if (!lessons.length) return null;
  const panel = sheet('lessons','Lessons','night');
  const layout = node('div','','mgn-process');
  const notes = node('ul','','mgn-fact-grid');
  const doodles = [
    ['M10 75l7-18 37-37 13 13-37 37-20 5Z','M17 57l13 13M48 26l13 13'],
    ['M10 36h48v21c0 20-48 20-48 0V36Zm48 3h10c18 0 10 18-10 17','M20 24c12-7-8-9 4-18m13 18c12-7-8-9 4-18'],
    ['M5 72l28-52 26 52H5Zm41-23 13-26 23 49H59','M25 35l8 7 8-7'],
  ];
  lessons.forEach((lesson,index) => {
    const item = node('li','','mgn-fact');
    item.dataset.ink = '';
    item.append(ink('0 0 90 90',doodles[index % doodles.length]),node('span',lesson,'mgn-hand mgn-write'));
    notes.append(item);
  });
  layout.append(heading('Lessons'),notes);
  panel.append(layout);
  return panel;
}

function endSheet(data, content, url) {
  const panel = sheet('footer','Thank you');
  panel.classList.add('mgn-end');
  const layout = node('div', '', 'mgn-edu');
  const text = node('div');
  text.append(heading('Thank you'));
  if (content.closing?.trim()) {
    const note = node('p',content.closing,'mgn-letter mgn-bio mgn-hand mgn-write');
    note.dataset.ink = '';
    text.append(note);
  }
  layout.append(text);
  if (url) {
    const wrap = node('div', '', 'mgn-qr-wrap');
    const frame = node('figure', '', 'mgn-qr');
    const canvas = node('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Scan to open ' + data.displayName + '’s portfolio');
    const tag = node('figcaption', 'scan me', 'mgn-qr-tag mgn-write');
    const note = node('div', '', 'mgn-cvnote mgn-hand');
    note.append(ink('0 0 90 60', ['M84 50Q32 55 10 16','M12 30l-2-14 14 3']),node('span', 'scan to open this page', 'mgn-write'));
    frame.append(tag, canvas);
    wrap.append(frame, note);
    wrap.dataset.ink = '';
    wrap.hidden = true;
    layout.append(wrap);
    import('./streak-invite-qr.js').then(({drawInviteQr}) => drawInviteQr(canvas,url))
      .then(() => { wrap.hidden = false; }).catch(() => {});
  }
  const footer = node('footer', '', 'mgn-foot');
  const home = node('a', 'Ledgerline');
  home.href = '/';
  const top = node('button', 'back to top');
  top.append(ink('0 0 16 22', ['M8 20C6 14 10 8 8 3','M3 8l5-5 5 5']));
  footer.append(home, node('span','Trading journal · For informational purposes'),top);
  panel.append(layout,footer);
  return panel;
}

function requestJump(section) {
  section.dispatchEvent(new Event('portfolio-jump', {bubbles:true}));
}

function ownerSection(key, title, action, field, tone = 'paper') {
  const panel = sheet('edit-'+key,title,tone);
  const layout = node('div','','mgn-process mgn-owner-section');
  layout.append(heading(title),node('p','Only visible to you until you add content.','mgn-p'));
  if (key === 'playbook') {
    const phones = node('div','','mgn-setup-phones mgn-empty-phones');
    phones.setAttribute('aria-hidden','true');
    handsetViews.forEach((view,i) => {
      const slot = node('div','','mgn-phone-slot');
      slot.dataset.slot = String(i);
      slot.append(setupPhone(view,['Your setup','',''],0));
      phones.append(slot);
    });
    layout.append(phones);
  }
  if (field) {
    const add = node('button',action,'mgn-section-action');
    add.type = 'button';
    add.onclick = () => panel.dispatchEvent(new CustomEvent('portfolio-edit',{bubbles:true,detail:field}));
    layout.append(add);
  } else {
    const link = node('a',action,'mgn-section-action');
    link.href = '/portfolio#pf-sections-heading';
    layout.append(link);
  }
  panel.append(layout);
  return panel;
}

function addContents(page, data, sheets) {
  const chrome = node('div', '', 'mgn-top');
  const bar = node('div', '', 'mgn-bar');
  const trigger = node('button', journal, 'mgn-bar-btn');
  trigger.setAttribute('aria-label', journal + ' contents');
  trigger.setAttribute('aria-controls', 'portfolio-contents');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.append(oval());
  const right = node('span', '', 'mgn-bar-right');
  right.append(node('span', data.displayName, 'mgn-bar-name'),node('span', 'cover', 'mgn-bar-sec'));
  bar.append(node('span',year),trigger,right,node('span','','mgn-progress'));
  chrome.append(bar);
  const holder = node('div', '', 'mgn-hold');
  const menu = node('nav', '', 'mgn-index');
  menu.id = 'portfolio-contents';
  menu.inert = true;
  menu.setAttribute('aria-label', 'Contents');
  const close = node('button', 'close ×', 'mgn-index-close');
  const list = node('ol');
  list.style.setProperty('--rows', Math.ceil(sheets.length/2));
  function setOpen(open) {
    menu.inert = !open;
    menu.dataset.open = String(open);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      requestAnimationFrame(() => { if (!menu.inert) close.focus(); });
    } else trigger.focus();
  }
  menu.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
  trigger.onclick = () => setOpen(menu.inert);
  close.onclick = () => setOpen(false);
  sheets.forEach((section,index) => {
    const row = node('li');
    const choice = node('button');
    choice.append(node('small', String(index + 1).padStart(2,'0')),node('span',section.dataset.label));
    choice.onclick = () => {
      setOpen(false);
      requestJump(section);
    };
    row.append(choice);
    list.append(row);
  });
  menu.append(close,list,node('div',journal + ' — ' + data.displayName,'mgn-index-foot'));
  holder.append(menu);
  page.append(chrome,holder,...sheets);
}

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
  const page = mountPage(landing,'<main class="n-root mgn-root"><p class="portfolio-load" role="status">Loading portfolio…</p></main>');
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
    page.dataset.frame=data.sections?.presentation?.frame || 'phone';
    const url = data.visibility === 'private' ? '' : new URL(portfolioPath(slug),location.origin).href;
    const content = {...data.sections?.content};
    for(const key of data.sections?.presentation?.hidden ?? []) delete content[key];
    const sheets = [
      coverSheet(data,content),
      data.about || (data.sections?.photo && data.avatar) ? helloSheet(data)
        : owner && ownerSection('hello','Hello','Add your introduction','about'),
      educationSheet(data,content) || (owner && ownerSection('education','Badges and courses','Add a course','courses')),
      processSheet(data.sections ?? {}, data.stats ?? {}) || (owner && ownerSection('process','Process','Choose stats to share',null,'night')),
      skillsSheet(content) || (owner && ownerSection('skills','Skills','Add your tools and rules','tools')),
      ...playbookSheets(content,data.sections?.setupStats ? data.setupStats : [],data.sections,owner),
      lessonsSheet(content) || (owner && ownerSection('lessons','Lessons','Add a lesson','lessons','night')),
      endSheet(data,content,url),
    ].filter(Boolean).filter(panel=>{
      const id=panel.id.replace(/^portfolio-(edit-)?/,'');
      const hidden=data.sections?.presentation?.hidden ?? [];
      return !((id!=='education' && hidden.includes(id)) || (id==='education' && hidden.includes('education') && !content.markets) || (id.startsWith('setup-') && hidden.includes('playbook')));
    });
    addContents(page, data, sheets);
    if (owner) addOwnerActions(page, slug, data);
    status.remove();
    bindPortfolioMotion(page, sheets);
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
