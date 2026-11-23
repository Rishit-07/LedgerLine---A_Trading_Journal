/* Shared behaviour for buttons and form fields (styles are in styles/controls.css).
   - Marks required fields with a visible asterisk and a screen-reader "required".
   - A required field that is empty shows the red error state after the person leaves it or presses the
     primary button. It clears as soon as the field is valid.
   - On a failed submit: focuses the first invalid field, scrolls it into view and announces the count.
   It works on top of native validation (`required`, `min`, `max`), so existing submit handlers do not change. */

const PLAIN = '[type="button"],[type="submit"],[type="reset"],[type="image"],[type="hidden"],[type="color"],[type="range"]';
const CONTROLS = 'input,textarea,select';
const REQUIRED = 'input[required],textarea[required],select[required]';
const TEXTLIKE = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not(' + PLAIN.split(',').join('):not(') + '),textarea,select';

let live;
let counter = 0;
let batch = [];
let batchTimer = 0;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isControl = (node) => node instanceof HTMLElement && node.matches(CONTROLS) && !node.matches(PLAIN);
const isEmpty = (control) => control.type === 'checkbox' || control.type === 'radio'
  ? !control.checked
  : control.type === 'file' ? control.files.length === 0 : control.value.trim() === '';

/** The element that draws the border: the control's .n-in/.n-out wrapper when it is the only control in it. */
function boxOf(control) {
  const group = control.closest('fieldset[data-required-group]');
  if (group) return group;
  if (control.matches('[type="checkbox"],[type="radio"],[type="file"]')) return control.closest('label') ?? control;
  const parent = control.parentElement;
  if (parent?.matches('.n-in,.n-out,.field__box') && parent.querySelectorAll(':scope > input,:scope > textarea,:scope > select').length === 1) return parent;
  return control;
}

function labelFor(control) {
  if (control.labels?.length) return control.labels[0];
  return control.closest('label');
}

function nameOf(control) {
  const label = labelFor(control);
  const text = label ? [...label.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ') : '';
  return (text.trim() || control.getAttribute('aria-label') || control.placeholder || control.name || 'this field')
    .replace(/[*:]+$/, '').trim();
}

function messageFor(control) {
  const v = control.validity;
  if (control.dataset.requiredMessage && (v.valueMissing || v.customError)) return control.dataset.requiredMessage;
  if (v.customError) return control.validationMessage;
  if (v.tooShort) return 'Write at least ' + control.minLength + ' characters';
  if (v.typeMismatch && control.type === 'url') return 'Enter a full link, for example https://example.com';
  if (v.typeMismatch && control.type === 'email') return 'Enter a valid email address';
  if (v.valueMissing) {
    if (control.matches('[type="checkbox"]')) return 'Tick this box to continue';
    if (control.matches('select')) return 'Choose ' + nameOf(control).toLowerCase() + ' before saving';
    return 'Add ' + nameOf(control).toLowerCase() + ' before saving';
  }
  return control.validationMessage || 'Check this field';
}

export function showError(control, text = messageFor(control)) {
  const box = boxOf(control);
  box.dataset.invalid = 'true';
  control.setAttribute('aria-invalid', 'true');
  let msg = control.dataset.msgId && document.getElementById(control.dataset.msgId);
  if (!msg) {
    msg = document.createElement('p');
    msg.className = 'field__msg';
    msg.id = 'field-msg-' + ++counter;
    msg.append(Object.assign(document.createElement('span'), { textContent: '!' }), document.createElement('span'));
    msg.firstChild.setAttribute('aria-hidden', 'true');
    control.dataset.msgId = msg.id;
    box.after(msg);
    const described = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    control.setAttribute('aria-describedby', [...described, msg.id].join(' '));
  }
  msg.lastChild.textContent = text;
}

export function clearError(control) {
  const box = boxOf(control);
  delete box.dataset.invalid;
  control.removeAttribute('aria-invalid');
  const id = control.dataset.msgId;
  if (!id) return;
  document.getElementById(id)?.remove();
  delete control.dataset.msgId;
  const rest = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter((part) => part && part !== id);
  if (rest.length) control.setAttribute('aria-describedby', rest.join(' ')); else control.removeAttribute('aria-describedby');
}

function announce(text) {
  if (!live) {
    live = document.createElement('div');
    live.className = 'field-status';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('role', 'status');
    document.body.append(live);
  }
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 30);
}

/** Mark a field required in the label or, when there is only a placeholder, inside the box. */
const markers = new WeakMap();
function markRequired(control) {
  if (control.dataset.reqMarked) return;
  control.dataset.reqMarked = '1';
  control.setAttribute('aria-required', 'true');
  if (control.matches('[type="hidden"]')) return;
  const marker = document.createElement('span');
  markers.set(control, marker);
  marker.className = 'field__req';
  const star = Object.assign(document.createElement('span'), { textContent: ' *' });
  star.setAttribute('aria-hidden', 'true');
  marker.append(star, Object.assign(document.createElement('span'), { className: 'sr-only', textContent: ' (required)' }));
  const label = labelFor(control);
  const textNode = label && [...label.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
  if (textNode) {
    // Keep the text and the marker in one box so a grid or flex label does not split them.
    const text = document.createElement('span');
    textNode.replaceWith(text);
    text.append(textNode, marker);
    return;
  }
  const legendText = label?.querySelector(':scope > span:not(.n-in):not(.n-out):not([class*="ws-"])');
  if (legendText && legendText.textContent.trim() && !legendText.contains(control)) { legendText.append(marker); return; }
  const box = boxOf(control);
  if (box !== control && control.matches(TEXTLIKE)) {
    marker.classList.add('field__req--inline');
    box.classList.add('field__box--req');
    box.prepend(marker);
  } else if (control.matches('[type="checkbox"]')) {
    label?.append(marker);
  } else {
    marker.classList.add('field__req--inline');
    control.after(marker);
  }
}

/** Turn "required" on or off for a field whose need depends on other answers, keeping the marker in step. */
export function setRequired(control, on) {
  if (on) {
    control.required = true;
    markRequired(control);
    return;
  }
  control.required = false;
  control.removeAttribute('aria-required');
  delete control.dataset.reqMarked;
  markers.get(control)?.remove();
  markers.delete(control);
  clearError(control);
}

/** A group of checkboxes where at least one must be ticked (native "required" cannot express that). */
export function requireAny(fieldset, message) {
  const boxes = [...fieldset.querySelectorAll('input[type="checkbox"]')];
  if (!boxes.length) return;
  fieldset.dataset.requiredGroup = '1';
  const legend = fieldset.querySelector('legend');
  if (legend && !legend.querySelector('.field__req')) {
    const marker = document.createElement('span');
    marker.className = 'field__req';
    const star = Object.assign(document.createElement('span'), { textContent: ' *' });
    star.setAttribute('aria-hidden', 'true');
    marker.append(star, Object.assign(document.createElement('span'), { className: 'sr-only', textContent: ' (required)' }));
    legend.append(marker);
  }
  const sync = () => {
    const ok = boxes.some((box) => box.checked);
    boxes[0].setCustomValidity(ok ? '' : message);
    if (ok) clearError(boxes[0]);
  };
  for (const box of boxes) box.addEventListener('change', sync);
  sync();
}

export function enhance(root = document) {
  for (const control of root.querySelectorAll?.(REQUIRED) ?? []) markRequired(control);
  if (root instanceof HTMLElement && root.matches(REQUIRED)) markRequired(root);
}

function flush() {
  batchTimer = 0;
  const invalid = [...new Set(batch)].filter((control) => control.isConnected);
  batch = [];
  if (!invalid.length) return;
  const first = invalid[0];
  first.focus({ preventScroll: true });
  boxOf(first).scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  announce(invalid.length === 1 ? '1 field needs attention' : invalid.length + ' fields need attention');
}

function queue(control) {
  batch.push(control);
  if (!batchTimer) batchTimer = setTimeout(flush, 0);
}

function visible(control) {
  return !control.disabled && !control.closest('[hidden]') && control.getClientRects().length > 0;
}

/** A primary button that is not in a <form> still checks the required fields next to it. */
function validateNear(button) {
  let scope = button.parentElement;
  for (let depth = 0; scope && depth < 4; depth += 1, scope = scope.parentElement) {
    const fields = [...scope.querySelectorAll(REQUIRED)].filter((control) => !control.form && visible(control));
    if (!fields.length) continue;
    const bad = fields.filter(isEmpty);
    for (const control of fields) if (bad.includes(control)) { showError(control); queue(control); } else clearError(control);
    return bad.length === 0;
  }
  return true;
}

export function initControls() {
  if (initControls.done) return;
  initControls.done = true;
  enhance(document);

  // Native validation fires `invalid` for each bad field when a form is submitted. Replace the browser bubble.
  document.addEventListener('invalid', (event) => {
    const control = event.target;
    if (!isControl(control)) return;
    event.preventDefault();
    showError(control);
    queue(control);
  }, true);

  // Leaving an empty required field shows the error. Nothing red before the person has touched it.
  document.addEventListener('focusout', (event) => {
    const control = event.target;
    if (!isControl(control) || !control.required || control.matches('[type="checkbox"],[type="radio"],[type="file"]')) return;
    if (!visible(control)) return;
    if (isEmpty(control)) showError(control);
  }, true);

  const recheck = (event) => {
    const control = event.target;
    if (!isControl(control) || !control.hasAttribute('aria-invalid')) return;
    if (control.checkValidity()) clearError(control);
    else if (control.validity.valueMissing) showError(control);
  };
  document.addEventListener('input', recheck, true);
  document.addEventListener('change', recheck, true);

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('.btn') : null;
    if (!button) return;
    if (button.getAttribute('aria-disabled') === 'true') { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (button.matches('.btn-primary[type="button"]') && !button.form && !validateNear(button)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  // Pages build their forms in script, so look at what gets added.
  const added = new Set();
  let scheduled = false;
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') { if (record.target.hasAttribute('required')) added.add(record.target); }
      else for (const node of record.addedNodes) if (node instanceof HTMLElement) added.add(node);
    }
    if (scheduled || !added.size) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const nodes = [...added];
      added.clear();
      for (const node of nodes) if (node.isConnected) enhance(node);
    });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['required'] });
}

/** Put a button in the loading state while a request is in flight, and back. */
export function setBusy(button, busy) {
  if (!button) return;
  button.classList.toggle('is-loading', busy);
  if (busy) { button.setAttribute('aria-busy', 'true'); button.setAttribute('aria-disabled', 'true'); }
  else { button.removeAttribute('aria-busy'); button.removeAttribute('aria-disabled'); }
}
