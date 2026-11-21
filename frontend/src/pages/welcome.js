import welcomeMarkup from './welcome.html?raw';

const wait = ms => new Promise(resolve => setTimeout(resolve,ms));

export async function showWelcome(page,user,next) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) return location.replace(next);
  const renderer = import('../components/glass-logo.ts').catch(() => null);
  const stamp = page.querySelector('#auth-stamp');
  if (stamp) stamp.replaceWith(stamp.content.cloneNode(true));
  await wait(350);
  const template = document.createElement('template');
  template.innerHTML = welcomeMarkup;
  const overlay = template.content.firstElementChild;
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-labelledby','welcome-title');
  overlay.querySelector('[data-welcome-name]').textContent = user.displayName?.trim().split(/\s+/)[0] || 'trader';
  const destination = new URL(next,location.origin).pathname;
  const captions = {'/dashboard':'Opening your dashboard','/onboarding':'Opening your setup','/journal':'Opening your journal'};
  overlay.querySelector('.in-lab').textContent = captions[destination] ?? 'Opening your workspace';
  const skip = overlay.querySelector('.in-skip');
  skip.href = next;
  let leaving = false;
  async function leave(immediate) {
    if (leaving) return;
    leaving = true;
    if (!immediate && !reduceMotion.matches && typeof overlay.animate === 'function') {
      await overlay.animate([{opacity:1},{opacity:0}],{duration:180,fill:'forwards'}).finished.catch(() => {});
    }
    location.replace(next);
  }
  skip.onclick = event => {event.preventDefault();void leave(true);};
  overlay.onkeydown = event => {
    if (event.key === 'Escape') void leave(true);
    if (event.key === 'Tab') {event.preventDefault();skip.focus();}
  };
  (page.querySelector('.au-root') ?? page.firstElementChild).inert = true;
  page.append(overlay);
  skip.focus({preventScroll:true});
  const logo = overlay.querySelector('.welcome-mark');
  const playback = renderer.then(module => module?.revealLogo(logo)).catch(() => {});
  await Promise.race([Promise.all([playback,wait(1900)]),wait(5500)]);
  await leave(false);
}
