export const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const day = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
export const formatDate = (value) => value ? day.format(new Date(value)) : '—';
export function formatResetCountdown(iso) {
  if (!iso) return '';
  const diffMs = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 60_000) return 'Resets in <1m';
  const totalMin = Math.ceil(diffMs / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `Resets in ${days}d ${hours}h`;
  if (hours > 0) return `Resets in ${hours}h ${mins}m`;
  return `Resets in ${mins}m`;
}
export const signedR = (value) => value == null ? '—' : (value > 0 ? '+' : '') + number.format(value) + 'R';
export const rate = (value) => value == null ? '—' : number.format(value) + '%';
export const markets = { stocks:'Stocks', options:'Options', futures:'Futures', forex:'Forex', crypto:'Crypto' };
export const select = (page, selector) => page.querySelector(selector);
export const formValues = (form) => Object.fromEntries(new FormData(form));
export function node(tag, value = '', className = '') {
  const item = document.createElement(tag);
  item.textContent = value;
  if (className) item.className = className;
  return item;
}
export const button = (text, callback) => {
  const item = node('button',text,'btn btn-secondary');
  item.type = 'button';
  item.addEventListener('click', callback);
  return item;
};
export const stat = (label, value, detail = '') => {
  const item = node('div','','n-in ws-stat');
  item.append(node('span',label),node('strong',value),node('small',detail));
  return item;
};
export const message = (value) => node('p',value,'ws-empty');

export async function submit(event, status, save) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.hasAttribute('aria-busy')) return;
  const values = formValues(form);
  form.setAttribute('aria-busy','true');
  const button = event.submitter;
  if (button) button.disabled = true;
  status.textContent = 'Saving…';
  try { status.textContent = (await save(values)) ?? 'Saved.'; }
  catch (error) { status.textContent = error.message; }
  finally { form.removeAttribute('aria-busy'); if (button) button.disabled = false; }
}

export function fillTradeOptions(select, trades) {
  select.replaceChildren(new Option('Choose a trade',''), ...trades.map((trade) =>
    new Option(trade.symbol + ' · ' + formatDate(trade.openedAt), trade.id)));
}

export function closedSummary(trades) {
  const closed = trades.filter(({ result }) => result !== null);
  const sum = closed.reduce((total, trade) => total + trade.result, 0);
  const wins = closed.filter(({ result }) => result > 0).length;
  return { closed, sum: closed.length ? sum : null, winRate: closed.length ? 100*wins/closed.length : null,
    average: closed.length ? sum/closed.length : null };
}

export function drawLine(canvas, points, { dark = false } = {}) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0,0,width,height);
  if (!points.length) { canvas.hidden = true; return; }
  canvas.hidden = false;
  const [min,max] = [Math.min(0,...points),Math.max(0,...points)];
  const x = (i) => 18 + (width-36)*i/Math.max(1,points.length-1);
  const y = (v) => height-18-(height-36)*(v-min)/(max-min || 1);
  const css = getComputedStyle(canvas);
  if (dark) {
    ctx.fillStyle = '#23252b';
    ctx.fillRect(0,0,width,height);
    ctx.strokeStyle = '#ffffff18';
    ctx.lineWidth = 1;
    for(let grid=1;grid<=5;grid++){
      ctx.beginPath();ctx.moveTo(18,grid*height/6);ctx.lineTo(width-18,grid*height/6);ctx.stroke();
    }
    const fill=ctx.createLinearGradient(0,15,0,height);
    fill.addColorStop(0,'#8a94ff77');fill.addColorStop(1,'#8a94ff00');
    ctx.beginPath();ctx.moveTo(x(0),y(0));
    points.forEach((value,index)=>ctx.lineTo(x(index),y(value)));
    ctx.lineTo(x(points.length-1),y(0));ctx.closePath();ctx.fillStyle=fill;ctx.fill();
  }
  ctx.strokeStyle = dark ? '#ffffff70' : css.getPropertyValue('--track').trim();
  ctx.lineWidth=1;
  if(dark)ctx.setLineDash([7,5]);
  ctx.beginPath(); ctx.moveTo(18,y(0)); ctx.lineTo(width-18,y(0)); ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();
  points.forEach((value,index) => index ? ctx.lineTo(x(index),y(value)) : ctx.moveTo(x(index),y(value)));
  ctx.strokeStyle = dark ? '#aab0ff' : css.getPropertyValue('--acc').trim();
  ctx.lineWidth = dark ? 2.5 : 4; ctx.stroke();
}

export function metric(label, value, detail = '', state = '') {
  const tile=stat(label,value,detail);
  tile.className='n-out ws-stat ws-metric';
  if(state)tile.querySelector('strong').className=state;
  return tile;
}
