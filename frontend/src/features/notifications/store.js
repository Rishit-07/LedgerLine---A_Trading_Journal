/* One shared notification connection per tab: the unread count for the bell and a live stream of new rows.
   Uses a streamed fetch (not EventSource) because the request must carry the sign-in token. */
const listeners = new Set();
let unread = 0;
let started = false;

export const unreadCount = () => unread;
export function setUnread(value) { unread = Math.max(0, Number(value) || 0); for (const fn of listeners) fn({ type: 'count', unread }); }
export function onNotifications(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function startNotifications(user) {
  if (started) return;
  started = true;
  const headers = async () => ({ Authorization: 'Bearer ' + await user.getIdToken() });
  const refresh = async () => {
    try {
      const response = await fetch('/api/notifications/count', { headers: await headers(), signal: AbortSignal.timeout(10000) });
      if (response.ok) setUnread((await response.json()).unread);
    } catch { /* keep the last count */ }
  };
  let delay = 5000;
  async function connect() {
    try {
      const response = await fetch('/api/notifications/stream', { headers: await headers() });
      if (!response.ok || !response.body) throw new Error('stream');
      delay = 5000;
      await refresh();
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (!block.includes('event: notification')) continue;
          const data = block.split('\n').find((line) => line.startsWith('data: '));
          if (!data) continue;
          try { const row = JSON.parse(data.slice(6)); unread += 1; for (const fn of listeners) fn({ type: 'new', row, unread }); } catch { /* ignore a broken frame */ }
        }
      }
    } catch { /* fall through to reconnect */ }
    setTimeout(connect, delay);
    delay = Math.min(delay * 2, 60000);
  }
  void refresh();
  void connect();
  // If the stream is blocked by a network, the count still catches up.
  setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
}
