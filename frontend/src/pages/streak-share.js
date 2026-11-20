import { bindPageTheme, mountPage } from './shared.js';
import './streak.css';

const themes = {
  ivory: { label: 'Ivory', start: '#fff7df', end: '#f4d6a2', ink: '#31272a', mark: '#a54b23' },
  indigo: { label: 'Indigo', start: '#626fda', end: '#292b78', ink: '#fff', mark: '#e3e7ff' },
  night: { label: 'Night', start: '#303744', end: '#12151d', ink: '#fff', mark: '#ffb978' },
};
const title = 'Ledgerline journal streak';

function drawCard(canvas, state, theme) {
  const ctx = canvas.getContext('2d');
  const colors = themes[theme];
  ctx.clearRect(0, 0, 720, 840);
  const background = ctx.createLinearGradient(0, 0, 720, 840);
  background.addColorStop(0, colors.start);
  background.addColorStop(1, colors.end);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 720, 840);
  ctx.strokeStyle = colors.mark;
  ctx.globalAlpha = .3;
  ctx.lineWidth = 2;
  ctx.strokeRect(32, 32, 656, 776);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.mark;
  ctx.font = '700 23px "Schibsted Grotesk Variable", Arial, sans-serif';
  ctx.fillText('THE JOURNAL STREAK', 360, 120);
  ctx.beginPath();
  ctx.moveTo(360, 166);
  ctx.bezierCurveTo(370, 190, 394, 213, 394, 232);
  ctx.bezierCurveTo(394, 272, 326, 272, 326, 231);
  ctx.bezierCurveTo(326, 206, 353, 219, 360, 166);
  ctx.fill();
  ctx.fillStyle = colors.ink;
  ctx.font = '750 150px "Schibsted Grotesk Variable", Arial, sans-serif';
  ctx.fillText(state.current, 360, 418, 600);
  ctx.font = '700 42px "Schibsted Grotesk Variable", Arial, sans-serif';
  ctx.fillText('day streak', 360, 486);
  ctx.font = '600 24px "Schibsted Grotesk Variable", Arial, sans-serif';
  ctx.fillText('Best ' + state.best + (state.best === 1 ? ' day' : ' days') + '  ·  Level ' + state.level, 360, 552);
  for (let index = 0; index < 7; index++) {
    ctx.globalAlpha = state.week[index] ? 1 : .27;
    ctx.beginPath();
    ctx.arc(210 + 50 * index, 630, 13, 0, 2 * Math.PI);
    ctx.fillStyle = colors.mark;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.ink;
  ctx.textAlign = 'left';
  ctx.font = '750 26px "Schibsted Grotesk Variable", Arial, sans-serif';
  ctx.fillText('Ledgerline', 67, 755);
}

function shareLink(token) {
  const url = new URL('/streak/share', location.origin);
  url.hash = token;
  return url.href;
}

export const shareMarkup = `
  <dialog class="streak-share" data-streak-share aria-labelledby="streak-share-title">
    <canvas width="720" height="840" role="img" aria-label="Your Ledgerline journal streak card"></canvas>
    <section class="n-out streak-share-sheet">
      <header><h2 id="streak-share-title">Share streak</h2><div data-share-themes class="streak-share-themes" aria-label="Share card theme"></div></header>
      <div class="streak-share-targets">
        <button type="button" class="n-btn n-out" data-share-choice="whatsapp">WhatsApp</button>
        <button type="button" class="n-btn n-out" data-share-choice="instagram">Instagram</button>
        <button type="button" class="n-btn n-out" data-share-choice="copy">Copy link</button>
        <button type="button" class="n-btn n-out" data-share-choice="save">Save image</button>
      </div>
      <p class="streak-message" role="status" data-share-message></p>
      <form method="dialog"><button class="n-btn n-out streak-btn">Close</button></form>
    </section>
  </dialog>`;

const toFile = (canvas) => new Promise((resolve) =>
  canvas.toBlob((blob) => resolve(blob ? new File([blob], 'ledgerline-streak.png', { type: 'image/png' }) : null), 'image/png'));

function saveImage(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function bindStreakShare(page, request) {
  const dialog = page.querySelector('[data-streak-share]');
  const canvas = dialog.querySelector('canvas');
  const message = dialog.querySelector('[data-share-message]');
  let theme = 'ivory';
  let state;
  let file;
  let url;
  let version = 0;
  const themeButtons = Object.entries(themes).map(([key, { label }]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.theme = key;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', () => { theme = key; update(); });
    return button;
  });
  dialog.querySelector('[data-share-themes]').append(...themeButtons);
  function update() {
    const current = ++version;
    message.textContent = '';
    themeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.theme === theme)));
    drawCard(canvas, state, theme);
    file = null;
    url = undefined;
    void toFile(canvas).then((image) => { if (current === version) file = image; });
    void request('/api/streak/share', 'POST', { theme }).then(({ token }) => {
      if (current === version) url = shareLink(token);
    }).catch(() => { if (current === version) message.textContent = 'The share link could not load. You can still save the image.'; });
  }
  dialog.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-share-choice]')?.dataset.shareChoice;
    if (!action) return;
    if (['whatsapp', 'copy'].includes(action) && !url) {
      message.textContent = 'The share link is not ready. You can still save the image.';
      return;
    }
    if (action === 'whatsapp') {
      window.open('https://wa.me/?text=' + encodeURIComponent(title + ' · ' + url), '_blank', 'noopener,noreferrer');
      return;
    }
    if (action === 'copy') {
      try { await navigator.clipboard.writeText(url); message.textContent = 'Streak link copied.'; }
      catch { message.textContent = 'Copy this link: ' + url; }
      return;
    }
    if (!file) { message.textContent = 'The image is still being prepared.'; return; }
    if (action === 'instagram' && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title }); }
      catch (error) { if (error.name !== 'AbortError') message.textContent = 'Use Save image to share from Instagram.'; }
      return;
    }
    saveImage(file);
    message.textContent = action === 'instagram' ? 'Image saved. You can post it from Instagram.' : 'Streak image saved.';
  });
  return (streak) => {
    state = streak;
    message.textContent = '';
    update();
    dialog.showModal();
  };
}

export async function renderSharedStreak(landing) {
  document.title = title + ' — Ledgerline';
  const page = mountPage(landing, `
    <main class="n-root streak-shared-page">
      <header><a href="/">Ledgerline</a><button type="button" class="n-btn n-out streak-btn" data-page-theme>Dark mode</button></header>
      <canvas width="720" height="840" role="img" aria-label="A shared Ledgerline journal streak card" hidden></canvas>
      <p data-share-error role="status">Loading streak card…</p>
    </main>`);
  bindPageTheme(page);
  const status = page.querySelector('[data-share-error]');
  try {
    const token = /^#([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.exec(location.hash)?.[1];
    if (!token) throw new Error('Invalid token');
    const response = await fetch('/api/streak/share?token=' + encodeURIComponent(token), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Unavailable');
    const state = await response.json();
    const canvas = page.querySelector('canvas');
    canvas.hidden = false;
    canvas.setAttribute('aria-label', 'Ledgerline journal streak. ' + state.current + ' days, best ' + state.best + ' days, level ' + state.level + '.');
    drawCard(canvas, state, state.theme);
    status.hidden = true;
  } catch {
    status.textContent = 'This streak link is unavailable.';
  }
}
