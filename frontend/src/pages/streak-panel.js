import { parseStreakInvite, streakInviteCode, streakInvitePath } from '../streak-invite.js';
import { bindStreakShare, shareMarkup } from './streak-share.js';
import { bindStreakPanel, element, streakRule } from './streak-view.js';

export const streakPanelMarkup = `
  <dialog class="n-out streak-panel" id="streak" aria-labelledby="streak-title">
    <header class="streak-panel-header">
      <h2 id="streak-title">Journal streak</h2>
      <form method="dialog"><button class="n-btn n-out streak-btn" aria-label="Close streak">×</button></form>
    </header>
    <p data-streak-load class="streak-message" role="status"></p>
    <div data-streak-content hidden>
      <div class="streak-stage"><img data-tally src="/tally-calm.svg" alt="Tally calm" width="110" height="110" /></div>
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
          <button class="n-btn n-acc streak-btn">Log rest day</button>
        </form>
        <p class="streak-message" data-streak-rest-status role="status"></p>
      </details>
      <section class="n-in streak-social" aria-labelledby="streak-friends-title">
        <div class="streak-heading">
          <h3 id="streak-friends-title">Streak together</h3>
          <button type="button" class="n-btn n-out streak-btn" data-copy-invite>Copy invite link</button>
        </div>
        <label class="streak-invite-fallback" hidden>Your invite link<input type="text" class="n-out" data-invite-link readonly /></label>
        <form class="streak-action-form" data-invite-form>
          <label>Friend’s invite link or code<input class="n-out" name="invite" required maxlength="512" /></label>
          <button class="n-btn n-acc streak-btn">Send invite</button>
        </form>
        <p class="streak-message" role="status" data-invite-status></p>
        <div data-friends></div>
      </section>
      <section class="n-in streak-social" aria-labelledby="streak-battle-title">
        <h3 id="streak-battle-title">Streak battle</h3>
        <div data-battle-empty>
          <p class="streak-message">Battles are available once a friend invite is accepted.</p>
          <button type="button" class="n-btn n-out streak-btn" data-go-to-invite>Go to invites</button>
        </div>
        <form class="streak-action-form" data-battle-form hidden>
          <label>Friend<select name="friendId" class="n-out" required></select></label>
          <label>Length<select name="lengthDays" class="n-out"><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option></select></label>
          <button class="n-btn n-acc streak-btn">Send challenge</button>
        </form>
        <p class="streak-message" role="status" data-battle-status></p>
        <div data-battles></div>
      </section>
      <footer class="streak-panel-footer">
        <button type="button" class="n-btn n-acc streak-btn" data-share-streak>Share streak</button>
        <a class="n-btn n-out streak-btn" href="/journal">Open journal</a>
      </footer>
      <p class="streak-footnote">${streakRule}</p>
    </div>
  </dialog>${shareMarkup}`;

export function bindStreakDialog(page, { request, getState, onState }) {
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
    const button = element('button', label, 'n-btn n-out streak-btn');
    button.type = 'button';
    button.addEventListener('click', () => action(button, inviteStatus, 'Updating connection…', async () => {
      await request('/api/streak/friends/' + route, 'POST', { id: friend.id });
      inviteStatus.textContent = success;
      await refreshSocial();
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
    } else {
      battle.hidden = true;
      inviteStatus.textContent = 'Could not load friends. Close and reopen the streak to retry.';
    }
    if (battles.status === 'fulfilled') {
      dialog.querySelector('[data-battles]').replaceChildren(...battles.value.battles.map((record) => element('div',
        friendName(record) + ' · ' + record.lengthDays + ' days · ' +
        ({ tie: 'Tie', won: 'Won', lost: 'Lost' }[record.result] ?? 'In progress'), 'streak-social-row')));
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
    await request('/api/streak/friends/invite', 'POST', { code });
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
  dialog.querySelector('[data-copy-invite]').addEventListener('click', async () => {
    const code = getState()?.inviteCode;
    if (!code) { inviteStatus.textContent = 'Your invite link is not ready yet.'; return; }
    const link = new URL(streakInvitePath('/streak/invite', code), location.origin).href;
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
  dialog.querySelector('[data-share-streak]').addEventListener('click', () => share(getState()));

  function open(code = '') {
    if (dialog.open || page.querySelector('dialog[open]')) return;
    if (code) {
      showIncomingInvite = true;
      inviteInput.value = code;
      inviteStatus.textContent = 'Invite link received. Choose Send invite to request the connection.';
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
