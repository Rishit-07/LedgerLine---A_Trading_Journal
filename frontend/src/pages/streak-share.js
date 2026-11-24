import {startedDownload} from '../components/file-actions.js';
import { showSkeleton } from '../skeleton.js';
import { bindPublicAccount } from './public-account.js';
import { bindPageTheme, mountPage } from './shared.js';
import './streak.css';

const themes = {
  ivory: { label: 'Ivory', start: '#fff7df', end: '#f4d6a2', ink: '#31272a', mark: '#a54b23' },
  indigo: { label: 'Indigo', start: '#626fda', end: '#292b78', ink: '#fff', mark: '#e3e7ff' },
  night: { label: 'Night', start: '#303744', end: '#12151d', ink: '#fff', mark: '#ffb978' },
};
const title = 'Ledgerline journal streak';
let brandIcon;
function loadBrandIcon() {
  if (!brandIcon) {
    const icon = new Image();
    icon.src = '/ledgerline-icon.svg';
    brandIcon = icon.decode().then(() => icon).catch(() => null);
  }
  return brandIcon;
}

function drawCard(canvas, state, theme, icon) {
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
  if (icon) ctx.drawImage(icon, 67, 728, 36, 36);
  ctx.fillText('Ledgerline', icon ? 114 : 67, 755);
}

function shareLink(token) {
  const url = new URL('/streak/share', location.origin);
  url.hash = token;
  return url.href;
}

export const shareMarkup = `
  <dialog class="streak-share" data-streak-share aria-labelledby="streak-share-title">
    <section class="n-out streak-share-sheet">
      <header>
        <h2 id="streak-share-title"><img src="/ledgerline-icon.svg" alt="" width="24" height="24" /> Share streak</h2>
        <form method="dialog"><button class="btn btn-ghost" aria-label="Close share sheet">×</button></form>
      </header>
      <canvas width="720" height="840" role="img" aria-label="Your Ledgerline journal streak card"></canvas>
      <div data-share-themes class="streak-share-themes" aria-label="Share card theme"></div>
      <div class="streak-share-targets">
        <button type="button" class="btn btn-ghost" data-share-choice="whatsapp"><span class="share-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.5 7.5L4 20l.9-3.9a8.5 8.5 0 1 1 15.6-4.5Z"/><path d="M9 8.5c-.8 1 .7 4.9 4.1 6.4 1.5.7 2.5.2 2.8-.7l-2.2-1.4-1 .8a6 6 0 0 1-2.3-2.5l.6-.9L10 8.3Z"/></svg></span>WhatsApp</button>
        <button type="button" class="btn btn-ghost" data-share-choice="instagram"><span class="share-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><path d="M16.5 7.5h.01"/></svg></span>Instagram</button>
        <button type="button" class="btn btn-ghost" data-share-choice="copy"><span class="share-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 13 4-4m-6 7-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m2 8a3.5 3.5 0 0 0 5 0l4-4a3.5 3.5 0 0 0-5-5l-1 1" transform="translate(0 1)"/></svg></span>Copy link</button>
        <button type="button" class="btn btn-ghost" data-share-choice="save"><span class="share-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 16v3h14v-3"/></svg></span>Save image</button>
      </div>
      <p class="streak-message" role="status" data-share-message></p>
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
  let onClose;
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
    file = null;
    drawCard(canvas, state, theme);
    url = undefined;
    void loadBrandIcon().then((icon) => {
      if (current !== version) return null;
      drawCard(canvas, state, theme, icon);
      return toFile(canvas);
    }).then((image) => { if (current === version) file = image; });
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
    if(action==='save')startedDownload(dialog.querySelector('[data-share-choice="save"]'));
    message.textContent = action === 'instagram' ? 'Image saved. You can post it from Instagram.' : 'Streak image saved.';
  });
  dialog.addEventListener('close', () => {
    const restore = onClose;
    onClose = undefined;
    restore?.();
  });
  return (streak, restore) => {
    state = streak;
    onClose = restore;
    message.textContent = '';
    update();
    dialog.showModal();
  };
}

export async function renderSharedStreak(landing) {
  document.title = title + ' — Ledgerline';
  const page = mountPage(landing, `
    <main class="n-root streak-shared-page">
      <header><a href="/">Ledgerline</a><button type="button" class="btn btn-secondary" data-page-theme>Dark mode</button></header>
      <canvas width="720" height="840" role="img" aria-label="A shared Ledgerline journal streak card" hidden></canvas>
      <p data-share-error role="status">Loading streak card…</p>
    </main>`);
  bindPageTheme(page);
  bindPublicAccount(page);
  const status = page.querySelector('[data-share-error]');
  const hideSkeleton = showSkeleton(status, 'chart');
  try {
    const token = /^#([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.exec(location.hash)?.[1];
    if (!token) throw new Error('Invalid token');
    const response = await fetch('/api/streak/share?token=' + encodeURIComponent(token), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Unavailable');
    const state = await response.json();
    const canvas = page.querySelector('canvas');
    canvas.hidden = false;
    canvas.setAttribute('aria-label', 'Ledgerline journal streak. ' + state.current + ' days, best ' + state.best + ' days, level ' + state.level + '.');
    drawCard(canvas, state, state.theme, await loadBrandIcon());
    status.hidden = true;
  } catch {
    status.textContent = 'This streak link is unavailable.';
  } finally { hideSkeleton(); }
}
