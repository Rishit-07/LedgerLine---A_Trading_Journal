import { node } from '../../pages/workspace-ui.js';
import { toast } from '../notifications/toast.js';
import './mentorship.css';

export const path = '/api/mentorship';
export const el = (tag, className, text) => node(tag, text ?? '', className);
export const fail = (error) => toast(error?.message || 'Could not do that. Try again.');
export function btn(text, className, onClick) {
  const b = el('button', 'btn ' + className, text); b.type = 'button';
  b.addEventListener('click', async () => {
    if (b.disabled) return;
    b.disabled = true; b.setAttribute('aria-busy', 'true');
    try { await onClick(b); } catch (error) { fail(error); } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  });
  return b;
}
export function field(label, control, required) {
  const wrap = el('label', 'mt-field');
  wrap.append(el('span', '', label + (required ? ' (required)' : '')), control);
  if (required) { control.required = true; control.setAttribute('aria-required', 'true'); }
  const msg = el('span', 'mt-msg'); msg.setAttribute('role', 'alert'); wrap.append(msg);
  wrap.check = () => {
    const bad = required && !String(control.value).trim();
    wrap.dataset.invalid = String(bad); control.setAttribute('aria-invalid', String(bad));
    msg.textContent = bad ? `Add ${label.toLowerCase()} before saving` : '';
    return !bad;
  };
  control.addEventListener('blur', () => { if (control.dataset.touched || !String(control.value).trim()) { control.dataset.touched = '1'; wrap.check(); } });
  control.addEventListener('input', () => { if (wrap.dataset.invalid === 'true') wrap.check(); });
  return wrap;
}
export function check(label, checked, disabled) {
  const wrap = el('label', 'mt-check'); const box = el('input'); box.type = 'checkbox'; box.checked = checked; box.disabled = Boolean(disabled);
  const span = el('span'); span.append(label);
  wrap.append(box, span); wrap.box = box; return wrap;
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied.'); } catch { toast('Could not copy. Select and copy it yourself.'); }
}
