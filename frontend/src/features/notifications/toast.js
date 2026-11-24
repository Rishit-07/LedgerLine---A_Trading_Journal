import { popIn } from './motion.js';
let timer;
export function toast(text) {
  let box = document.querySelector('[data-notif-toast]');
  if (!box) {
    box = document.createElement('div');
    box.className = 'n-out notif-toast';
    box.dataset.notifToast = '';
    box.setAttribute('role', 'status');
    document.body.append(box);
  }
  box.textContent = text;
  box.hidden = false;
  popIn(box);
  clearTimeout(timer);
  timer = setTimeout(() => { box.hidden = true; }, 4200);
}
