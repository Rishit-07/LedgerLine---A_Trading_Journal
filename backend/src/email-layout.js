// One shared look for Ledgerline emails: table layout, inline styles, no remote images, no tracking pixels.
// It works in Gmail, Outlook and Apple Mail, and reads well when a client forces dark mode.
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const INK = '#1f1f1c';
const MUTED = '#5a5953';
const ACCENT = '#4f5bd5';
const PAPER = '#f3f2ec';
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";
const SANS = "'Schibsted Grotesk', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

/** A bulletproof button: a table cell with a background, so it shows even when the client blocks CSS backgrounds. */
export function button(label, href) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 4px"><tr>
<td bgcolor="${ACCENT}" style="border-radius:12px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 26px;font:700 16px ${SANS};color:#ffffff;text-decoration:none;border-radius:12px">${escapeHtml(label)}</a></td></tr></table>`;
}

export const paragraph = (text) => `<p style="margin:0 0 16px;font:400 16px/1.6 ${SANS};color:${INK}">${text}</p>`;

/**
 * @param {{preheader:string, title:string, body:string, origin:string, reason:string}} parts
 * body is trusted markup built with paragraph() and button(); escape anything user-supplied before putting it in.
 */
export function layout({ preheader, title, body, origin, reason }) {
  const privacy = new URL('/privacy', origin).href;
  const terms = new URL('/terms', origin).href;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAPER}">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${PAPER}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
<tr><td style="padding:0 6px 14px;font:400 30px ${SERIF};color:${INK}">Ledgerline</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:18px;border-top:4px solid ${ACCENT};padding:32px 30px">
<h1 style="margin:0 0 18px;font:400 32px/1.2 ${SERIF};color:${INK}">${escapeHtml(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:18px 6px 0;font:400 13px/1.6 ${SANS};color:${MUTED}">${escapeHtml(reason)}<br>
<a href="${escapeHtml(privacy)}" style="color:${MUTED}">Privacy Policy</a> · <a href="${escapeHtml(terms)}" style="color:${MUTED}">Terms</a></td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * A complete message (text and html) in the shared look. `lines` are plain strings and are escaped here.
 * @param {{title:string, preheader?:string, lines:string[], action?:{label:string, href:string}, origin:string, reason?:string}} parts
 */
export function branded({ title, preheader, lines, action, origin, reason = 'You are getting this because you have a Ledgerline account.' }) {
  const body = lines.map((line) => paragraph(escapeHtml(line).replace(/\n/g, '<br>'))).join('') + (action ? button(action.label, action.href) : '');
  const text = [title, '', ...lines, ...(action ? ['', `${action.label}: ${action.href}`] : []), '', reason].join('\n');
  return { text, html: layout({ preheader: preheader ?? lines[0] ?? title, title, body, origin, reason }) };
}
