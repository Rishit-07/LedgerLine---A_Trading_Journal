/* Ledger, as inline SVG so the eyes can follow the cursor. The artwork is the design pack's, unchanged.
   Class names, keyframes and gradient ids are prefixed per instance so several bots never share styles. */
import calm from './assets/ledger-calm.svg?raw';
import think from './assets/ledger-think.svg?raw';
import cheer from './assets/ledger-cheer.svg?raw';
import sleep from './assets/ledger-sleep.svg?raw';
import tuck from './assets/ledger-tuck.svg?raw';

const ART = { calm, think, cheer, sleep, tuck };
export const STATES = Object.keys(ART);
const NAMES = 'fl|bl|lk|bn|br|dt|dt2|dt3|cf|cf2|cf3|pr|zz|zz2|tw|tk';
let serial = 0;

export function botSvg(state) {
  const id = 'lb' + ++serial;
  let text = ART[state] ?? ART.calm;
  text = text
    .replace(new RegExp(`\\.(${NAMES})(?![\\w-])`, 'g'), `.${id}-$1`)
    .replace(/class="([^"]*)"/g, (_, list) => `class="${list.trim().split(/\s+/).map((c) => `${id}-${c}`).join(' ')}"`)
    .replace(/@keyframes (\w+)/g, `@keyframes ${id}-$1`)
    .replace(new RegExp(`animation:(${NAMES})(?= )`, 'g'), `animation:${id}-$1`)
    .replace(/id="(g|h|sh)"/g, `id="${id}-$1"`)
    .replace(/url\(#(g|h|sh)\)/g, `url(#${id}-$1)`);
  const holder = document.createElement('div');
  holder.innerHTML = text.trim();
  const svg = holder.firstElementChild;
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('lb-art');
  // Wrap the two white eyes so script can move them without fighting the artwork's own transforms.
  const blinks = [...svg.querySelectorAll(`.${id}-bl`)];
  let eyes = null;
  if (blinks.length === 2) {
    eyes = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    blinks[0].before(eyes);
    eyes.append(blinks[0], blinks[1]);
    eyes.style.transition = 'transform .12s ease-out';
  }
  const look = svg.querySelector(`.${id}-lk`);
  return { svg, eyes, look, id };
}
