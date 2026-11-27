/* MetaTrader (MT4 and MT5) history parsing. Pure functions, no database.
   Accepts the HTML or CSV a trader saves from the terminal (MT4: Account History > Save as Detailed Report;
   MT5: History > Report > HTML or Excel/CSV, "Positions" table). Times are the platform's server time and are stored as UTC. */

const MAX_TEXT = 1_500_000;
export const MAX_ROWS = 2000;

const entities = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const plain = (html) => html.slice(0, 50_000).replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (m) => entities[m]).replace(/\s+/g, ' ').trim();

function htmlRows(text) {
  const rows = [];
  for (const chunk of text.split(/<tr[\s>]/i).slice(1)) {
    if (chunk.length > 20_000) continue;   // a real row is a few hundred characters; anything huge is not a report
    const cells = [...chunk.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => plain(m[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function csvRows(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines.slice(0, 20).join('\n');
  const delimiter = [';', '\t', ','].map((d) => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  return lines.map((line) => {
    const cells = []; let cell = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) { if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
      else if (c === '"') quoted = true;
      else if (c === delimiter) { cells.push(cell.trim()); cell = ''; }
      else cell += c;
    }
    cells.push(cell.trim());
    return cells;
  });
}

const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
const idxAll = (head, ...names) => head.map((h, i) => (names.includes(h) ? i : -1)).filter((i) => i >= 0);

function columns(cells) {
  const head = cells.map(norm);
  if (!head.includes('type') || !head.includes('profit') || !(head.includes('symbol') || head.includes('item'))) return null;
  const times = idxAll(head, 'time', 'opentime', 'closetime'), prices = idxAll(head, 'price', 'openprice', 'closeprice');
  const open = head.indexOf('opentime') >= 0 ? head.indexOf('opentime') : times[0];
  const close = head.indexOf('closetime') >= 0 ? head.indexOf('closetime') : times[1];
  const col = { ticket: idxAll(head, 'ticket', 'position', 'order', 'deal')[0], symbol: idxAll(head, 'symbol', 'item')[0], type: head.indexOf('type'),
    volume: idxAll(head, 'volume', 'size', 'lots')[0], open, close, openPrice: head.indexOf('openprice') >= 0 ? head.indexOf('openprice') : prices[0],
    closePrice: head.indexOf('closeprice') >= 0 ? head.indexOf('closeprice') : prices[1], sl: idxAll(head, 'sl', 'stoploss')[0], tp: idxAll(head, 'tp', 'takeprofit')[0],
    commission: head.indexOf('commission') };
  return [col.ticket, col.symbol, col.volume, col.open, col.close, col.openPrice, col.closePrice].some((v) => v === undefined || v < 0) ? null : col;
}

export function number(text) {
  if (text === undefined || text === null) return NaN;
  let t = String(text).replace(/[\s ]/g, '');
  if (!t) return NaN;
  if (/^-?\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.'); else t = t.replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export function serverTime(text) {
  const m = String(text ?? '').trim().match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
  return Number.isNaN(d.getTime()) ? null : d;
}

const crypto = /^(BTC|ETH|LTC|XRP|SOL|DOGE|ADA|BNB)/i;

/** One closed MetaTrader position -> a Ledgerline trade, or a reason it cannot be one. R needs the stop loss, so a trade without one is skipped, never guessed. */
export function toTrade({ ticket, account, symbol, type, volume, openedAt, closedAt, entry, exit, stop, target, commission }) {
  const ref = `mt:${account || 'x'}:${ticket}`;
  const side = /^buy/i.test(type) ? 'long' : /^sell/i.test(type) ? 'short' : null;
  const name = String(symbol ?? '').toUpperCase().replace(/[^A-Z0-9._#-]/g, '').slice(0, 48);
  if (!ticket || !side) return { skip: { ref, reason: 'Not a buy or sell trade.' } };
  if (!name) return { skip: { ref, reason: 'No symbol.' } };
  if (!openedAt || !closedAt) return { skip: { ref, reason: 'Still open.' } };
  if (closedAt < openedAt) return { skip: { ref, reason: 'Close time is before open time.' } };
  if (![entry, exit].every((n) => Number.isFinite(n) && n > 0)) return { skip: { ref, reason: 'Missing prices.' } };
  if (!(stop > 0)) return { skip: { ref, reason: 'No stop loss on this trade, so R cannot be worked out.' } };
  const risk = side === 'long' ? entry - stop : stop - entry;
  if (!(risk > 0)) return { skip: { ref, reason: 'Stop loss was moved past the entry, so the original risk is unknown.' } };
  const r = ((side === 'long' ? exit - entry : entry - exit) / risk);
  if (!Number.isFinite(r)) return { skip: { ref, reason: 'R could not be worked out.' } };
  return { trade: { ref, symbol: name, market: crypto.test(name) ? 'crypto' : 'forex', side, qty: Number.isFinite(volume) && volume > 0 ? volume : null,
    entry, exit, stop, target: target > 0 ? target : null, fees: Number.isFinite(commission) ? Math.abs(commission) : null,
    openedAt, closedAt, result: Math.max(-999, Math.min(999, Math.round(r * 10000) / 10000)) } };
}

export function parseReport(text) {
  const body = String(text ?? '');
  if (!body.trim()) return { error: 'The file is empty.' };
  if (body.length > MAX_TEXT) return { error: 'That file is too large. Export a shorter date range.' };
  const rows = /<tr[\s>]/i.test(body) ? htmlRows(body) : csvRows(body);
  // The account number sits near the top; read only that part, with tags removed first, so no pattern can run away on a hostile file.
  const account = (plain(body.slice(0, 20_000)).match(/Account:?\s*(\d{4,12})/i) ?? [])[1] ?? '';
  let col = null; const trades = [], skipped = []; let seen = 0;
  for (const cells of rows) {
    if (!col) { col = columns(cells); continue; }
    if (cells.length < 8) continue;
    const type = (cells[col.type] ?? '').toLowerCase();
    if (!/^(buy|sell)$/.test(type)) continue;       // balance, credit, pending orders and totals are not trades
    if (++seen > MAX_ROWS) return { error: `That report has more than ${MAX_ROWS} trades. Export a shorter date range.` };
    const out = toTrade({ ticket: (cells[col.ticket] ?? '').replace(/\D/g, ''), account, symbol: cells[col.symbol], type, volume: number(cells[col.volume]),
      openedAt: serverTime(cells[col.open]), closedAt: serverTime(cells[col.close]), entry: number(cells[col.openPrice]), exit: number(cells[col.closePrice]),
      stop: col.sl === undefined ? NaN : number(cells[col.sl]), target: col.tp === undefined ? NaN : number(cells[col.tp]),
      commission: col.commission < 0 ? NaN : number(cells[col.commission]) });
    if (out.trade) trades.push(out.trade); else skipped.push(out.skip);
  }
  if (!col) return { error: 'This does not look like a MetaTrader history report. Save it from History (MT5) or Account History (MT4) as a report or CSV.' };
  if (!seen) return { error: 'No closed trades were found in that report.' };
  return { trades, skipped, found: seen };
}
