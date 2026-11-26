import { el, btn, check, path, fail } from './ui.js';

/** Pull the token out of a pasted link or a bare token. */
export const tokenFrom = (text) => {
  const value = String(text ?? '').trim();
  try { const t = new URL(value, location.origin).searchParams.get('token'); if (t) return t; } catch { /* not a URL */ }
  return /^[\w-]{30,100}$/.test(value) ? value : '';
};

/** Shows the community card and the consent screen for one link, and joins on confirm. Nothing is pre-ticked beyond Level 1. */
export async function consentFlow(root, { token, request, onDone }) {
  root.replaceChildren(el('p', '', 'Checking your link…'));
  let card;
  try { card = await request(path, 'POST', { action: 'preview', token }); }
  catch (error) {
    root.replaceChildren(el('h3', '', error.reason === 'used' ? 'This link has already been used' : 'This link cannot be used'), el('p', '', error.message));
    return;
  }
  const { space, shares, replaces } = card;
  root.replaceChildren();
  root.append(el('h3', '', space.name), el('p', '', `Led by ${space.mentor}${space.focus ? ' · ' + space.focus : ''} · ${space.size} of ${space.cap} members`));
  if (space.welcome) root.append(el('p', '', space.welcome));
  root.append(el('strong', '', 'House rules'), el('p', '', space.rules));
  root.append(el('strong', '', 'What your mentor will see'), el('p', 'mt-note', 'Level 1 is needed so a mentor can coach you. The rest is your choice. Change it any time.'));
  const l1 = check('Level 1: your process. ' + shares.level1, true, true);
  const l2 = check('Level 2: results in R. ' + shares.level2, false);
  const l3 = check('Level 3: notes and trades. ' + shares.level3, false);
  const rules = check('I accept the house rules.', false);
  const adult = check('I am 18 or older.', false);
  root.append(l1, l2, l3, el('p', 'mt-note', 'Sharing above Level 1 is asked again every 90 days, so it never carries on by accident.'), rules, adult);
  const msg = el('p', 'mt-msg'); msg.setAttribute('role', 'alert');
  if (replaces) root.append(el('p', '', `Joining ${space.name} will remove you from ${replaces}.`));
  const row = el('div', 'btn-row');
  const go = btn(`Join ${space.name}`, 'btn-primary', async () => {
    if (!rules.box.checked || !adult.box.checked) { msg.textContent = 'Accept the rules and confirm you are 18 or older.'; return; }
    msg.textContent = '';
    try {
      const out = await request(path, 'POST', { action: 'join', token, accept_rules: true, adult: true, level2: l2.box.checked, level3: l3.box.checked, replace: Boolean(replaces) });
      root.replaceChildren(el('h3', '', out.status === 'waitlist' ? 'You are on the waitlist' : `You are in ${space.name}`), el('p', '', out.status === 'waitlist' ? 'The mentor can let you in when a seat opens.' : 'You have one mentor at a time. Your journal stays yours.'));
      onDone?.(out);
    } catch (error) {
      if (error.reason === 'needs_pro') {
        const box = el('div'); box.append(el('h3', '', 'Joining a mentor needs Pro'), el('p', '', 'No data is shared until you have Pro. You can leave your mentor any time.'));
        const a = el('a', 'btn btn-primary', 'Get Pro'); a.href = '/billing';
        const b = el('a', 'btn btn-secondary', 'See plans'); b.href = '/billing';
        const r = el('div', 'btn-row'); r.append(a, b); box.append(r);
        root.replaceChildren(box);
      } else msg.textContent = error.message;
    }
  });
  const stay = btn('Cancel', 'btn-secondary', () => onDone?.(null));
  row.append(stay, go);
  root.append(msg, row);
}
