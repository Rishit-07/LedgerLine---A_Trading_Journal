import {portfolioSetups,setupColors} from '../../../../src/config/portfolio.js';
import {avatarUrl} from '../profile-picture.js';

const lines = value => String(value ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);

export const palettes = {
  marginalia:{paper:'#f1efe8',night:'#23262e',ink:'#1d2030',pen:'#5b6ee1'},
  terracotta:{paper:'#efe8dc',night:'#1f2a2b',ink:'#2a2420',pen:'#e0613a'},
  sage:{paper:'#eef0e6',night:'#1c2a24',ink:'#1f2a22',pen:'#2f8f6b'},
  dashboard:{paper:'#ecebfa',night:'#27244c',ink:'#252148',pen:'#514ac0'},
};
const toolColors = ['#1f2430','#5b6ee1','#17724a','#c75a1b','#7a3fe0','#c4284d'];
const doodles = ['pencil','coffee','mountain','book','plant','headphones','camera','globe'];
const screens = [['setup','rules','log'],['rules','log','setup'],['log','setup','rules']];

function art(kind, c1, c2) {
  const r = i => { const x = Math.sin(i * 12.9898 + kind.length * 78.233) * 43758.5453; return x - Math.floor(x); };
  let body = '';
  if (kind === 'candles') {
    let y = 760;
    for (let i = 0; i < 18; i++) {
      const up = r(i) > .42, d = 30 + r(i + 3) * 90, x = 50 + i * 40, top = y - (up ? d : 0);
      body += '<line x1="'+(x+11)+'" x2="'+(x+11)+'" y1="'+(top-26)+'" y2="'+(top+d+26)+'" stroke="#fff" stroke-opacity=".85" stroke-width="3"/><rect x="'+x+'" y="'+top+'" width="22" height="'+d+'" rx="4" fill="#fff" fill-opacity="'+(up ? .95 : .35)+'"/>';
      y += up ? -22 : 24;
    }
  } else if (kind === 'equity') {
    let p = 'M40 900', y = 900;
    for (let i = 1; i <= 16; i++) { y -= 20 + r(i) * 30 - (r(i + 9) > .7 ? 60 : 0); p += ' L' + (40 + i * 45) + ' ' + Math.max(300, y); }
    body = '<path d="'+p+'" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="'+p+' L760 1000 L40 1000Z" fill="#fff" fill-opacity=".14"/>';
  } else for (let i = 0; i < 6; i++) body += '<rect x="60" y="'+(280+i*130)+'" width="'+(220+r(i)*460)+'" height="64" rx="32" fill="#fff" fill-opacity="'+(.9-i*.1)+'"/>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+c1+'"/><stop offset="1" stop-color="'+c2+'"/></linearGradient></defs><rect width="800" height="1200" fill="url(#g)"/><circle cx="660" cy="190" r="150" fill="#fff" fill-opacity=".10"/>'+body+'</svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const patterns = ['candles','equity','bars'];

function monogram(letter, c1, c2) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+c1+'"/><stop offset="1" stop-color="'+c2+'"/></linearGradient></defs><rect width="600" height="750" fill="url(#g)"/><circle cx="300" cy="340" r="170" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="14"/><text x="300" y="412" text-anchor="middle" font-family="Georgia,serif" font-size="230" fill="#fff">'+letter.replace(/[<>&"]/g,'')+'</text></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function setupProjects(data, content, stats, theme, year) {
  const setups = portfolioSetups(data.sections ?? {});
  const frame = data.sections?.presentation?.frame === 'card' ? 'card' : 'phone';
  const sectionTitle = (content.playbookTitle || 'Playbook').trim();
  return setups.slice(0,5).map((setup,index) => {
    const result = stats?.find(item => item.name === setup.name);
    const accent = setup.color || setupColors[index % setupColors.length];
    const pat = Math.max(0,['columns','line','bars'].indexOf(setup.chart)) % 3;
    const measured = Number.isFinite(result?.adherence);
    const counted = Number.isFinite(result?.logged);
    const rules = String(setup.checks || setup.rule || '').split(/[;\n]/).map(s => s.trim()).filter(Boolean).slice(0,4);
    const figures = [];
    if (measured) figures.push({value:result.adherence,suffix:'%',label:'rules followed'});
    if (counted) figures.push({value:result.logged,label:'times journaled'});
    return {
      name:setup.name,
      tagline:setup.rule || 'My rule for this setup.',
      kind:counted ? 'Setup · logged ' + result.logged + ' times' : 'Setup',
      year,
      summary:setup.how || setup.rule || '',
      challenge:setup.hard || undefined,
      stats:figures.length ? figures : undefined,
      images:[art(patterns[pat],accent,theme.night),art(patterns[(pat+1)%3],theme.night,accent),art(patterns[(pat+2)%3],accent,'#1f2430')],
      screens:measured && counted ? screens[index % 3] : ['setup','rules','setup'],
      checks:rules,
      note:setup.note || '',
      week:[],
      pat,
      pct:measured ? result.adherence : undefined,
      n:counted ? result.logged : undefined,
      frame,
      accent,
      tag:setup.tag || undefined,
      sectionTitle,
    };
  });
}

/** Everything the Marginalia template needs, built from the saved portfolio and nothing else. */
export function marginaliaProps(data, {url='',owner=false}={}) {
  const presentation = data.sections?.presentation ?? {};
  const hidden = presentation.hidden ?? [];
  const show = key => !hidden.includes(key);
  const content = {...data.sections?.content};
  for (const key of hidden) delete content[key];
  const themeKey = palettes[presentation.theme || data.design] ? (presentation.theme || data.design) : 'marginalia';
  const theme = palettes[themeKey];
  const year = String(new Date().getFullYear());
  const name = data.displayName || 'Ledgerline';
  const photo = data.sections?.photo && data.avatar ? avatarUrl(data.avatar) : '';
  const portrait = photo || monogram(Array.from(name)[0]?.toUpperCase() ?? 'L',theme.pen,theme.night);

  const badges = show('education') ? (data.badges ?? []) : [];
  const courses = show('education') ? lines(content.courses) : [];
  const education = [
    ...badges.map((badge,index) => ({title:badge.name,place:'Issued by Ledgerline',period:String(new Date(badge.earnedAt).getFullYear() || ''),circled:index === 0})),
    ...courses.map(course => ({title:course,place:'Self-reported course',period:''})),
  ];
  const languages = lines(content.markets).map(market => ({name:market,level:'',value:null}));
  const tools = lines(content.tools).map((tool,index) => ({
    name:tool,mark:Array.from(tool.replace(/[^\p{L}\p{N} ]/gu,'').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0,2) || tool[0]).join(''),
    bg:index === 1 ? theme.pen : toolColors[index % toolColors.length],fg:'#ffffff',note:'',
  }));
  const books = lines(content.books).slice(0,7).map((title,index) => ({title,color:[theme.night,theme.pen,theme.paper,'#17724a','#c75a1b','#7a3fe0','#c4284d'][index % 7]}));
  const skills = lines(content.rules);
  const stats = data.stats ?? {};
  const shared = data.sections ?? {};
  const process = [
    ['streak','Journal streak',' days',Number.isFinite(stats.best) && Number.isFinite(stats.level) ? 'Best ' + stats.best + ' · Level ' + stats.level : ''],
    ['adherence','Rules followed','%',''],
    ['reviews','Trades reviewed','',''],
  ].filter(([key]) => shared[key] === true && Number.isFinite(stats[key]))
    .map(([key,label,suffix,detail]) => ({value:stats[key],suffix:key === 'streak' && stats[key] === 1 ? ' day' : suffix,label,detail}));
  const projects = show('playbook') ? setupProjects(data,content,data.sections?.setupStats ? data.setupStats : [],theme,year) : [];
  const facts = lines(content.lessons).map((text,index) => ({doodle:doodles[index % doodles.length],text}));
  const letter = (content.closing || '').trim();

  const sections = ['cover'];
  const placeholders = {};
  const hint = (key, tone, label, title, action, field, href) => {
    if (!owner || hidden.includes(key)) return;
    placeholders[key] = {tone, label, title, action, field, href};
    sections.push('ph:' + key);
  };
  if ((data.about && show('hello')) || photo) sections.push('hello');
  else hint('hello','paper','hello','Hello.','Add your introduction','about');
  if (education.length || languages.length) sections.push('education');
  else hint('education','paper','badges','Badges','Add a course','courses');
  if (process.length) sections.push('process');
  else hint('process','night','process','Process','Choose stats to share',null,'/portfolio#pf-sections-heading');
  if (tools.length || skills.length || books.length) sections.push('skills');
  else hint('skills','paper','skills','Skills','Add your tools and rules','tools');
  if (projects.length) sections.push('projects','cases');
  else hint('projects','night','playbook',(content.playbookTitle || 'Playbook').trim(),'Add a setup','setup:0');
  if (facts.length) sections.push('facts');
  else hint('facts','night','lessons','Lessons','Add a lesson','lessons');
  sections.push('thanks');

  return {
    name,role:data.headline || '',title:(content.cover || '').trim() || name,year,location:(content.location || '').trim(),
    docLabel:'Trading Journal',portrait,traits:[],greeting:'Hello.',bio:data.about || '',
    educationIntro:'',education,cvUrl:url || null,cvNote:'scan to open this page',languages,
    tools,toolNote:'',skillsIntro:'',skills,books,booksNote:books.length ? 'my reading list' : '',
    projectsNote:'',projects,facts,factsNote:'',process,
    thanks:'Thank you',email:'',links:[],letter,signature:name,
    colors:theme,sections,placeholders,fonts:{href:'',hand:"'Caveat Variable', Caveat, 'Bradley Hand', 'Segoe Print', cursive"},inkTrail:true,
    className:'mgn-live',
  };
}
