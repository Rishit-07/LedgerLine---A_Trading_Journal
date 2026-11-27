import { mountDeclared } from '../features/ledger-bot/index.js';
import { paginate } from './pagination.js';
import { gsap } from 'gsap';
import { fetchStreakInviter, parseStreakInvite, streakInviteCode, streakInvitePath } from '../streak-invite.js';
import { bindStreakShare, shareMarkup } from './streak-share.js';
import { bindStreakPanel, element, streakRule } from './streak-view.js';

export const streakPanelMarkup = `
  <dialog class="n-out streak-panel" id="streak" aria-labelledby="streak-title">
    <header class="streak-panel-header">
      <h2 id="streak-title">Journal streak</h2>
      <form method="dialog"><button class="btn btn-secondary" aria-label="Close streak">×</button></form>
    </header>
    <p data-streak-load class="streak-message" role="status"></p>
    <div data-streak-content hidden>
      <div class="streak-stage"><span data-tally></span></div>
      <div class="streak-number" data-streak-count>0</div>
      <h3>day streak</h3>
      <p class="streak-day-status" data-streak-message aria-live="polite"></p>
      <div class="streak-week" data-streak-week aria-label="Week from Monday through Sunday"></div>
      <a class="streak-zone" href="/settings" data-streak-zone></a>
      <div class="n-in streak-goal">
        <div><strong data-streak-goal></strong><span data-streak-ratio></span></div>
        <progress max="1" value="0" aria-label="Progress toward your best streak"></progress>
      </div>
      <div class="streak-chips">
        <span class="n-in" data-streak-freeze></span><span class="n-in" data-streak-best></span>
        <span class="n-in" data-streak-level></span><span class="n-in" data-streak-xp></span>
      </div>
      <details class="streak-rest">
        <summary>I sat out today</summary>
        <form class="streak-action-form" data-streak-rest>
          <label>Rest note (optional)<textarea class="n-in" name="note" maxlength="1000" rows="2"></textarea></label>
          <button class="btn btn-primary">Log rest day</button>
        </form>
        <p class="streak-message" data-streak-rest-status role="status"></p>
      </details>
      <section class="n-in streak-social" aria-labelledby="streak-friends-title">
        <div class="streak-heading">
          <h3 id="streak-friends-title">Streak together</h3>
          <div class="streak-invite-actions">
            <button type="button" class="btn btn-secondary" data-copy-invite>Copy invite link</button>
            <button type="button" class="btn btn-secondary" aria-expanded="false" aria-controls="streak-invite-qr" data-show-invite-qr>Show QR code</button>
          </div>
        </div>
        <figure class="streak-invite-qr" id="streak-invite-qr" hidden>
          <div class="streak-qr-frame">
            <canvas role="img" aria-label="Your Ledgerline streak invite QR code"></canvas>
          </div>
          <figcaption>Ask a friend to scan with their phone camera.</figcaption>
        </figure>
        <label class="streak-invite-fallback" hidden>Your invite link<input type="text" class="n-out" data-invite-link readonly /></label>
        <form class="streak-action-form" data-invite-form>
          <label>Friend’s invite link or code<input class="n-out" name="invite" required maxlength="512" /></label>
          <button class="btn btn-primary">Send invite</button>
        </form>
        <p class="streak-message" role="status" data-invite-status></p>
        <div class="streak-connected" data-streak-connected hidden>
          <div class="streak-tally-pair" aria-hidden="true">
            <span data-ledger="cheer" data-size="64" data-decor></span>
            <span data-ledger="cheer" data-size="64" data-decor></span>
          </div>
          <strong role="status"></strong>
          <small>Log, review, or take a rest day to keep your own streak going.</small>
        </div>
        <div data-friends></div>
      </section>
      <section class="n-in streak-social" aria-labelledby="streak-battle-title">
        <h3 id="streak-battle-title">Streak battle</h3>
        <div data-battle-empty>
          <p class="streak-message">Battles are available once a friend invite is accepted.</p>
          <button type="button" class="btn btn-secondary" data-go-to-invite>Go to invites</button>
        </div>
        <form class="streak-action-form" data-battle-form hidden>
          <label>Friend<select name="friendId" class="n-out" required></select></label>
          <label>Length<select name="lengthDays" class="n-out"><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option></select></label>
          <button class="btn btn-primary">Send challenge</button>
        </form>
        <p class="streak-message" role="status" data-battle-status></p>
        <div data-battles></div>
      </section>
      <footer class="streak-panel-footer">
        <button type="button" class="btn btn-primary" data-share-streak>Share streak</button>
        <a class="btn btn-secondary" href="/journal">Open journal</a>
      </footer>
      <p class="streak-footnote">${streakRule}</p>
    </div>
  </dialog>${shareMarkup}`;

export function bindStreakDialog(page, { request, getState, onState }) {
  mountDeclared(page);
  const dialog = page.querySelector('#streak');
  const content = dialog.querySelector('[data-streak-content]');
  const loadStatus = dialog.querySelector('[data-streak-load]');
  const paint = bindStreakPanel(dialog);
  const share = bindStreakShare(page, request);
  const invite = dialog.querySelector('[data-invite-form]');
  const inviteStatus = dialog.querySelector('[data-invite-status]');
  const inviteInput = invite.elements.invite;
  const battle = dialog.querySelector('[data-battle-form]');
  const battleStatus = dialog.querySelector('[data-battle-status]');
  const rest = dialog.querySelector('[data-streak-rest]');
  let socialVersion = 0;
  let refreshing;
  let showIncomingInvite = false;

  const friendName = (friend) => friend.name || 'Ledgerline member';
  const connection = dialog.querySelector('[data-streak-connected]');
  const pendingConnections = new Set();
  function celebrate(name) {
    connection.hidden = false;
    connection.querySelector('strong').textContent = 'You and ' + name + ' are now streaking together!';
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.fromTo(connection.querySelectorAll('img'), { y: 10, opacity: .3 },
        { y: 0, opacity: 1, stagger: .09, duration: .42, ease: 'back.out(2)', overwrite: true });
    }
    connection.scrollIntoView({ block: 'nearest' });
  }
  function rememberConnections(friends) {
    const code = getState()?.inviteCode;
    if (!code) return;
    const key = 'ledgerline-streak-pending:' + code;
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(key) ?? '[]'); } catch {}
    const accepted = friends.find((friend) => friend.outgoing && friend.status === 'active'
      && (pendingConnections.has(friend.id) || saved.includes(friend.id)));
    const pending = friends.filter((friend) => friend.outgoing && friend.status === 'pending');
    pendingConnections.clear();
    for (const friend of pending) pendingConnections.add(friend.id);
    try { localStorage.setItem(key, JSON.stringify([...pendingConnections])); } catch {}
    if (accepted) celebrate(friendName(accepted));
  }
  function revealIncomingInvite() {
    if (!showIncomingInvite || !dialog.open || content.hidden) return;
    showIncomingInvite = false;
    invite.scrollIntoView({ block: 'center' });
    invite.querySelector('button').focus({ preventScroll: true });
  }
  function paintState(state) {
    paint(state);
    dialog.querySelector('[data-streak-zone]').textContent = 'Timezone · ' + state.timezone;
    rest.querySelector('button').textContent = state.manualRestToday ? 'Update rest note' : 'Log rest day';
    content.hidden = false;
    revealIncomingInvite();
  }

  async function action(button, status, pendingMessage, callback) {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = pendingMessage;
    try { await callback(); }
    catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; updateChallenge(); }
  }

  function bindForm(form, status, pendingMessage, callback) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = new FormData(form);
      void action(event.submitter ?? form.querySelector('button'), status, pendingMessage, () => callback(values));
    });
  }

  function updateChallenge() {
    battle.querySelector('button').disabled = !battle.elements.friendId.value || battle.dataset.sending === 'true';
  }

  function friendButton(label, route, friend, success) {
    const button = element('button', label, 'btn btn-secondary');
    button.type = 'button';
    button.addEventListener('click', () => action(button, inviteStatus, 'Updating connection…', async () => {
      await request('/api/streak/friends/' + route, 'POST', { id: friend.id });
      inviteStatus.textContent = success;
      await refreshSocial();
      if (route === 'accept' && dialog.open) celebrate(friendName(friend));
    }));
    return button;
  }

  async function refreshSocial() {
    const version = ++socialVersion;
    const [friends, battles] = await Promise.allSettled([
      request('/api/streak/friends', 'GET'), request('/api/streak/battles', 'GET'),
    ]);
    if (version !== socialVersion) return;
    if (friends.status === 'fulfilled') {
      if (dialog.open) rememberConnections(friends.value.friends);
      const active = friends.value.friends.filter(({ status }) => status === 'active');
      const select = battle.elements.friendId;
      const selected = select.value;
      select.replaceChildren(new Option('Choose a friend', ''), ...active.map((friend) => new Option(friendName(friend), friend.id)));
      select.value = active.some(({ id }) => id === selected) ? selected : '';
      battle.hidden = !active.length;
      dialog.querySelector('[data-battle-empty]').hidden = Boolean(active.length);
      updateChallenge();
      const rows = friends.value.friends.map((friend) => {
        const row = element('div', '', 'streak-social-row');
        const label = friend.status === 'active' ? friend.current + ' day streak' : friend.outgoing ? 'Invite sent' : 'Invited you';
        row.append(element('span', friendName(friend) + ' · ' + label));
        if (friend.status === 'pending' && !friend.outgoing) row.append(friendButton('Accept invite', 'accept', friend, 'Friend connected.'));
        row.append(friendButton(friend.status === 'active' ? 'End friendship' : friend.outgoing ? 'Cancel invite' : 'Decline invite',
          'end', friend, friend.status === 'active' ? 'Friendship ended.' : 'Invite removed.'));
        return row;
      });
      dialog.querySelector('[data-friends]').replaceChildren(...rows);
      paginate(dialog.querySelector('[data-friends]'),'Streak friends');
    } else {
      battle.hidden = true;
      inviteStatus.textContent = 'Could not load friends. Close and reopen the streak to retry.';
    }
    if (battles.status === 'fulfilled') {
      dialog.querySelector('[data-battles]').replaceChildren(...battles.value.battles.map((record) => element('div',
        friendName(record) + ' · ' + record.lengthDays + ' days · ' +
        ({ tie: 'Tie', won: 'Won', lost: 'Lost' }[record.result] ?? 'In progress'), 'streak-social-row')));
      paginate(dialog.querySelector('[data-battles]'),'Streak battles');
    } else battleStatus.textContent = 'Could not load battles. Close and reopen the streak to retry.';
  }

  battle.elements.friendId.addEventListener('change', updateChallenge);
  dialog.querySelector('[data-go-to-invite]').addEventListener('click', () => inviteInput.focus());
  bindForm(invite, inviteStatus, 'Sending invite…', async (values) => {
    const code = parseStreakInvite(values.get('invite'));
    if (!code) throw new Error('Enter a Ledgerline invite link or a friend’s code.');
    if (code.toLowerCase() === getState()?.inviteCode?.toLowerCase()) {
      throw new Error('This is your invite link. Share it with the friend you want to invite.');
    }
    const { id } = await request('/api/streak/friends/invite', 'POST', { code });
    if (id) pendingConnections.add(id);
    invite.reset();
    const url = new URL(location.href);
    if (streakInviteCode(url.search) === code) {
      url.searchParams.delete('streakInvite');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
    inviteStatus.textContent = 'Invite sent. Your friend can accept it from their streak badge.';
    await refreshSocial();
  });
  bindForm(battle, battleStatus, 'Sending challenge…', async (values) => {
    battle.dataset.sending = 'true';
    try {
      await request('/api/streak/battles', 'POST', { friendId: values.get('friendId'), lengthDays: Number(values.get('lengthDays')) });
      battleStatus.textContent = 'Challenge started.';
      await refreshSocial();
    } finally { delete battle.dataset.sending; }
  });
  const restStatus = dialog.querySelector('[data-streak-rest-status]');
  bindForm(rest, restStatus, 'Saving rest day…', async (values) => {
    onState(await request('/api/streak/rest-day', 'POST', { note: values.get('note') }));
    rest.reset();
    restStatus.textContent = 'Rest day saved.';
  });
  function getInviteLink() {
    const code = getState()?.inviteCode;
    return code ? new URL(streakInvitePath('/streak/invite', code), location.origin).href : '';
  }

  const qrButton = dialog.querySelector('[data-show-invite-qr]');
  const qrFigure = dialog.querySelector('#streak-invite-qr');
  const qrCanvas = qrFigure.querySelector('canvas');
  function showInviteQr(visible) {
    qrFigure.hidden = !visible;
    qrButton.setAttribute('aria-expanded', String(visible));
    qrButton.textContent = visible ? 'Hide QR code' : 'Show QR code';
  }
  qrButton.addEventListener('click', async () => {
    if (!qrFigure.hidden) {
      showInviteQr(false);
      return;
    }
    const link = getInviteLink();
    if (!link) { inviteStatus.textContent = 'Your invite link is not ready yet.'; return; }
    qrButton.disabled = true;
    inviteStatus.textContent = 'Preparing your QR code…';
    try {
      const { drawInviteQr } = await import('./streak-invite-qr.js');
      await drawInviteQr(qrCanvas, link);
      if (dialog.open) showInviteQr(true);
      inviteStatus.textContent = '';
    } catch {
      inviteStatus.textContent = 'Could not show the QR code. Try again or copy your invite link.';
    } finally {
      qrButton.disabled = false;
    }
  });
  dialog.addEventListener('close', () => showInviteQr(false));

  dialog.querySelector('[data-copy-invite]').addEventListener('click', async () => {
    const link = getInviteLink();
    if (!link) { inviteStatus.textContent = 'Your invite link is not ready yet.'; return; }
    try {
      await navigator.clipboard.writeText(link);
      inviteStatus.textContent = 'Invite link copied.';
    } catch {
      const field = dialog.querySelector('[data-invite-link]');
      field.parentElement.hidden = false;
      field.value = link;
      field.focus();
      field.select();
      inviteStatus.textContent = 'Select and copy your invite link.';
    }
  });
  const shareButton = dialog.querySelector('[data-share-streak]');
  shareButton.addEventListener('click', () => {
    const state = getState();
    if (!state) return;
    const scrollTop = dialog.scrollTop;
    dialog.close();
    share(state, () => {
      if (!dialog.isConnected) return;
      dialog.showModal();
      dialog.scrollTop = scrollTop;
      shareButton.focus({ preventScroll: true });
      void refreshSocial();
    });
  });

  function open(code = '') {
    if (dialog.open || page.querySelector('dialog[open]')) return;
    if (code) {
      showIncomingInvite = true;
      inviteInput.value = code;
      inviteStatus.textContent = 'Invite link received. Choose Send invite to request the connection.';
      const initialMessage = inviteStatus.textContent;
      void fetchStreakInviter(code).then((name) => {
        if (name && inviteInput.value === code && inviteStatus.textContent === initialMessage) {
          inviteStatus.textContent = name + ' invited you. Send a connection request so they can accept it.';
        }
      }).catch(() => {});
    }
    const current = getState();
    if (current) paintState(current);
    dialog.showModal();
    dialog.scrollTop = 0;
    revealIncomingInvite();
    loadStatus.textContent = current ? '' : 'Loading your streak…';
    if (!refreshing) refreshing = request('/api/streak', 'GET').then((state) => {
      if (getState() === current) onState(state);
      loadStatus.textContent = '';
    }).catch(() => {
      loadStatus.textContent = 'Could not refresh your streak. Close and reopen to retry.';
    }).finally(() => { refreshing = undefined; });
    void refreshSocial();
  }

  return { open, paintState, dialog };
}
