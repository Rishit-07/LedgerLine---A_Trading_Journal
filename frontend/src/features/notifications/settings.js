import { node } from '../../pages/workspace-ui.js';
import { toast } from './toast.js';
import { disablePushOnThisDevice, enablePush } from './push.js';
import { moveKnob } from './motion.js';

const path = '/api/notification-settings';
const ROWS = [
  ['journal_reminder', 'Journal reminders', 'A nudge to log before the day ends.'],
  ['streak_risk', 'Streak at risk', 'One warning when a streak could end tonight.'],
  ['spaces', 'Spaces and mentors', 'Notes, posts, assignments and sessions.'],
  ['community', 'Community', 'Follows, battles and messages from friends.'],
  ['rewards', 'Rewards and badges', 'Unlocks and rewards waiting for you.'],
  ['account', 'Account and billing', 'Receipts, renewals and sign-ins.'],
];
const CHANNELS = [['in_app', 'IN-APP'], ['push', 'PUSH'], ['email', 'EMAIL']];
const QUIET = [['off', 'Off'], ['22-07', '10 pm to 7 am'], ['23-06', '11 pm to 6 am']];
const DELIVERY = [['instant', 'Instant'], ['daily', 'One summary at 8 pm']];
const REMIND = [['20:00', 'Log reminder at 8 pm'], ['21:00', 'Log reminder at 9 pm'], [null, 'No log reminder']];
const el = (tag, className, text) => node(tag, text ?? '', className);

export async function buildSettings(root, { request }) {
  let data = await request(path, 'GET');
  let prefs = null;
  try { prefs = await request('/api/streak/preferences', 'GET'); } catch { /* onboarding not finished */ }
  const fail = (message) => toast(message ?? 'Could not do that. Try again.');

  root.append(el('h2', '', 'Notification settings'), el('p', 'notif-sub', 'Choose where each kind reaches you.'));
  const matrix = el('div', 'notif-matrix');
  matrix.append(el('div'));
  for (const [, label] of CHANNELS) matrix.append(el('div', 'notif-col', label));
  const switches = new Map();
  for (const [kind, title, text] of ROWS) {
    const label = el('div', 'notif-label'); label.append(el('strong', '', title), el('span', '', text));
    matrix.append(label);
    for (const [channel, channelLabel] of CHANNELS) {
      const cell = el('div', 'notif-cell');
      const button = el('button', 'notif-switch'); button.type = 'button';
      button.setAttribute('role', 'switch');
      button.setAttribute('aria-label', `${title}: ${channelLabel.toLowerCase()}`);
      const knob = el('span', 'notif-knob'); button.append(knob);
      const paint = (instant) => { const on = data.matrix[kind][channel]; button.setAttribute('aria-checked', String(on)); moveKnob(knob, on, instant); };
      paint(true);
      if (channel === 'email' && !data.hasEmail) { /* verified email is saved on first change */ }
      button.addEventListener('click', async () => {
        const want = !data.matrix[kind][channel];
        button.disabled = true;
        data.matrix[kind][channel] = want; paint(false);
        try {
          if (channel === 'push' && want) await enablePush(request);
          data = await request(path, 'PUT', { kind, channel, value: want });
          if (channel === 'push' && !want && !Object.values(data.matrix).some((row) => row.push)) await disablePushOnThisDevice(request);
          toast('Saved.');
        } catch (error) {
          data.matrix[kind][channel] = !want;
          fail(error.status === 409 || error.name === 'PushError' ? error.message : undefined);
        } finally { paint(false); button.disabled = false; }
      });
      switches.set(kind + channel, button);
      cell.append(button); matrix.append(cell);
    }
  }
  root.append(matrix, el('p', 'notif-push-note', 'Push asks your browser for permission the first time. If you block it, the switch stays off. Your phone app will use the same devices later.'));

  const group = (title, note, options, current, onPick) => {
    const box = el('div', 'notif-group');
    box.append(el('h3', '', title));
    if (note) box.append(el('p', 'notif-sub', note));
    const chips = el('div', 'notif-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', title);
    for (const [value, label] of options) {
      const chip = el('button', 'btn btn-secondary notif-chip', label); chip.type = 'button';
      chip.setAttribute('aria-pressed', String(value === current()));
      chip.addEventListener('click', async () => {
        chips.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try { await onPick(value); for (const [i, b] of [...chips.children].entries()) b.setAttribute('aria-pressed', String(options[i][0] === current())); }
        catch (error) { fail(error.status === 409 ? error.message : undefined); }
        finally { chips.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
      });
      chips.append(chip);
    }
    box.append(chips);
    root.append(box);
  };
  group('Quiet hours', 'No push or email in this window. In-app still collects.', QUIET, () => data.quiet, async (value) => { data = await request(path, 'PUT', { quiet: value }); toast('Quiet hours saved.'); });
  group('Delivery', 'A summary replaces instant push and email, except the always-on ones.', DELIVERY, () => data.delivery, async (value) => { data = await request(path, 'PUT', { delivery: value }); toast('Delivery saved.'); });
  if (prefs) {
    let reminder = REMIND.some(([v]) => v === prefs.reminderTime) ? prefs.reminderTime : (prefs.reminderTime ?? null);
    group('Reminders', 'Sent only on trading days, and only if you have not logged, reviewed or noted a rest day.', REMIND, () => reminder, async (value) => {
      await request('/api/streak/preferences', 'PUT', { timezone: prefs.timezone, exchanges: prefs.exchanges, reminderTime: value });
      reminder = value; toast('Reminder saved.');
    });
  }

  const always = el('div', 'notif-group notif-always');
  always.append(el('h3', '', 'Always on, for your safety'), el('p', 'notif-sub', 'These cannot be turned off.'));
  const notes = ['A warning when you near your daily loss limit.', 'Someone signs in to your account.', 'Receipts and changes to your plan.'];
  data.always.forEach((title, index) => {
    const row = el('div', 'notif-kind');
    const copy = el('div'); copy.append(el('strong', '', title), el('p', '', notes[index] ?? ''));
    row.append(copy, el('span', 'notif-on', 'ON'));
    always.append(row);
  });
  root.append(always);
}
