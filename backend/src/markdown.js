/* A small, safe Markdown renderer for newsletter issues: headings, paragraphs, bullet lists, bold, italic and links.
   Everything is escaped first; only http(s) and mailto links are kept; no raw HTML is ever passed through. */
const esc = (text) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (url) => /^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(url) ? url : null;

function inline(raw) {
  const links = [];
  // Pull links out first so their URLs are not mangled by the bold and italic rules.
  let text = raw.replace(/\[([^\]]{1,200})\]\(([^)\s]{1,500})\)/g, (all, label, url) => {
    const ok = safeUrl(url);
    if (!ok) return label;
    links.push(`<a href="${esc(ok)}" rel="noopener noreferrer">${esc(label)}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  text = esc(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return text.replace(/\u0000(\d+)\u0000/g, (all, i) => links[Number(i)]);
}

export function renderMarkdown(source) {
  const lines = String(source).replace(/\r/g, '').split('\n');
  const out = [];
  let list = false;
  let paragraph = [];
  const flush = () => { if (paragraph.length) { out.push('<p>' + inline(paragraph.join(' ')) + '</p>'); paragraph = []; } };
  const closeList = () => { if (list) { out.push('</ul>'); list = false; } };
  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (heading) { flush(); closeList(); out.push(`<h${heading[1].length + 1}>${inline(heading[2])}</h${heading[1].length + 1}>`); }
    else if (bullet) { flush(); if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(bullet[1]) + '</li>'); }
    else if (!line.trim()) { flush(); closeList(); }
    else { closeList(); paragraph.push(line.trim()); }
  }
  flush(); closeList();
  return out.join('\n');
}

/** Plain-text version: the Markdown with link targets written out. */
export function markdownToText(source) {
  return String(source).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#{1,3}\s+/gm, '');
}
