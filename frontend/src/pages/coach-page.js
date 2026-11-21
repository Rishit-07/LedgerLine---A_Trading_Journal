import { node, formatDate } from './workspace-ui.js';
import './coach-page.css';

export const coach = {
  title: 'AI Coach',
  description: 'Ask questions about your trading process.',
  content: `<div class="coach-layout">
    <aside class="n-out ws-card coach-sidebar">
      <button type="button" class="n-btn n-acc dash-button" data-new-chat>+ New chat</button>
      <nav aria-label="Past chats" data-chat-history></nav>
    </aside>
    <section class="n-out ws-card ws-coach">
      <header class="ws-section-head"><img src="/tally-calm.svg" alt="" width="44" height="44">
        <div><h2 data-chat-title>New chat</h2><p data-chat-connection></p></div>
        <details class="coach-options" data-options hidden>
          <summary aria-label="Chat options">•••</summary>
          <div><button type="button" data-rename>Rename chat</button><button type="button" data-pin>Pin chat</button><button type="button" data-delete>Delete chat</button></div>
        </details>
      </header>
      <form class="coach-edit" data-edit hidden>
        <label data-rename-label>Chat name <input name="title" maxlength="80" autocomplete="off"></label>
        <span data-delete-label hidden>Delete this chat and its messages permanently?</span>
        <div><button class="n-btn n-out" type="button" data-cancel>Cancel</button>
        <button class="n-btn n-acc" type="submit" data-confirm>Save name</button></div>
      </form>
      <div class="ws-chat" role="log" aria-label="Conversation" data-coach-chat></div>
      <form class="ws-form" data-coach-form>
        <label class="ws-visually-hidden" for="coach-question">Message Ledger</label>
        <div class="coach-composer">
          <textarea id="coach-question" name="question" rows="2" maxlength="600" placeholder="Message Ledger…" required></textarea>
          <button type="submit" class="n-btn n-acc dash-button" aria-label="Send message" title="Send message">↑</button>
        </div>
        <div class="coach-composer-meta"><small>Enter to send · Shift+Enter for a new line</small><small data-token-balance></small></div>
        <small data-coach-consent></small>
      </form>
      <p data-coach-status role="status"></p>
    </section>
  </div>`,
  async bind(page, { data, save, request }) {
    const get = (selector) => page.querySelector(selector);
    const form = get('[data-coach-form]');
    const input = form.elements.question;
    const send = form.querySelector('button[type=submit]');
    const history = get('[data-chat-history]');
    const conversation = get('[data-coach-chat]');
    const status = get('[data-coach-status]');
    const chats = new Map(data.chats.map((chat) => [chat.id, chat]));
    const messages = new Map();
    const drafts = new Map();
    let activeId;
    let pending;
    let loadVersion = 0;
    let managing = false;
    const options = get('[data-options]');
    const editor = get('[data-edit]');

    get('[data-chat-connection]').textContent = data.available
      ? 'Ledger helps you review your process.'
      : 'AI chat is currently unavailable. Your past chats are still accessible.';
    get('[data-coach-consent]').textContent = 'Sending a message shares this conversation’s recent turns, up to 25 trades, rules, limits, recent plan summaries, mistake counts and your streak with ' + (data.provider || 'the AI provider') + '.';
    function paintTokens(remaining) {
      if (Number.isInteger(remaining)) get('[data-token-balance]').textContent = remaining.toLocaleString()+' tokens left · Refills at midnight IST';
    }
    paintTokens(data.tokens?.remaining);

    function paintTurns(newReply) {
      conversation.replaceChildren();
      for (const turn of messages.get(activeId) || []) {
        const reply = node('article', '', 'n-in ws-list-card');
        const body = node('p', turn.answer);
        reply.append(node('strong', 'Ledger'), body);
        if (turn === newReply && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const visible = node('span', '');
          visible.setAttribute('aria-hidden','true');
          body.replaceChildren(node('span', turn.answer, 'ws-visually-hidden'), visible);
          const chars = Array.from(turn.answer);
          const start = performance.now();
          const duration = Math.min(2200, chars.length * 22);
          function reveal(now) {
            if (!body.isConnected) return;
            const nearBottom = conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 48;
            const end = Math.ceil(chars.length * Math.min(1, (now - start) / duration));
            visible.textContent = chars.slice(0,end).join('');
            if (nearBottom) conversation.scrollTop = conversation.scrollHeight;
            if (end < chars.length) requestAnimationFrame(reveal);
          }
          requestAnimationFrame(reveal);
        }
        const references = new Set(Array.from(turn.answer.matchAll(/\[Trade (\d+)\]/gi), (match) => Number(match[1])));
        for (const source of (turn.sources || []).filter((item) => references.has(item.reference))) {
          const link = node('a', 'Trade ' + source.reference + ' · ' + formatDate(source.openedAt));
          link.href = '/history?tradeId=' + encodeURIComponent(source.tradeId);
          reply.append(link);
        }
        conversation.append(node('p', turn.question, 'coach-question'), reply);
      }
      if (pending?.id === activeId) {
        const thinking = node('p', 'Ledger is replying', 'coach-thinking');
        const dots = node('span', '•••');
        dots.setAttribute('aria-hidden','true');
        thinking.append(dots);
        conversation.append(node('p', pending.question, 'coach-question'), thinking);
      }
      if (messages.has(activeId) && !conversation.childElementCount) {
        conversation.append(node('p', 'Send a message to start this chat.', 'ws-empty'));
      }
      conversation.scrollTop = conversation.scrollHeight;
    }

    function paintHistory() {
      const ordered = [...chats.values()].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));
      history.replaceChildren(node('h3', 'Past chats'), ...ordered.map((chat) => {
        const button = node('button', '', 'n-btn');
        button.title=chat.title;
        if (chat.pinned) {
          button.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 4 5 5-3 1-3 4v3l-2 2-7-7 2-2h3l4-3zM8 16l-5 5"/></svg>';
          button.setAttribute('aria-label','Pinned chat: '+chat.title);
        }
        button.append(node('span',chat.title,'coach-history-title'));
        button.type = 'button';
        if (chat.id === activeId) button.setAttribute('aria-current', 'true');
        button.addEventListener('click', () => void open(chat.id));
        return button;
      }));
      if (!ordered.length) history.append(node('p', 'No past chats.'));
      for (const [id, draft] of drafts) {
        if (!draft || chats.has(id) || id === activeId) continue;
        const button = node('button', 'Unsent chat', 'n-btn');
        button.type = 'button';
        button.addEventListener('click', () => void open(id, true));
        history.append(button);
      }
      get('[data-chat-title]').textContent = chats.get(activeId)?.title || 'New chat';
      get('[data-chat-title]').title = get('[data-chat-title]').textContent;
      options.hidden = !chats.has(activeId) || pending?.id === activeId || managing;
      get('[data-pin]').textContent = chats.get(activeId)?.pinned ? 'Unpin chat' : 'Pin chat';
    }

    function updateSend() {
      send.disabled = !data.available || Boolean(pending) || managing || !messages.has(activeId) || !input.value.trim();
    }

    async function open(id, focus = false) {
      if (activeId) drafts.set(activeId, input.value);
      const version = ++loadVersion;
      activeId = id;
      editor.hidden = true;
      options.open = false;
      input.value = drafts.get(id) || '';
      status.textContent = '';
      paintHistory();
      paintTurns();
      updateSend();
      if (focus) input.focus();
      if (messages.has(id)) return;
      status.textContent = 'Loading chat…';
      try {
        const result = await request('/api/workspace?' + new URLSearchParams({ page: 'coach', chatId: id }), 'GET');
        if (version !== loadVersion) return;
        messages.set(id, result.messages);
        paintTurns();
        status.textContent = '';
      } catch (error) {
        if (version === loadVersion) status.textContent = error.message;
      } finally {
        updateSend();
      }
    }

    function newChat() {
      const id = crypto.randomUUID();
      messages.set(id, []);
      void open(id, true);
    }

    function edit(action) {
      options.open = false;
      editor.dataset.action = action;
      editor.hidden = false;
      get('[data-rename-label]').hidden = action !== 'rename';
      get('[data-delete-label]').hidden = action !== 'delete';
      get('[data-confirm]').textContent = action === 'rename' ? 'Save name' : 'Delete chat';
      editor.elements.title.value = chats.get(activeId).title;
      if (action === 'rename') editor.elements.title.select();
      else get('[data-cancel]').focus();
    }
    async function changeChat(action) {
      const id = activeId;
      if (managing || pending?.id === id || !chats.has(id)) return;
      const payload = {chatId:id, action};
      if (action === 'pin') payload.pinned = !chats.get(id).pinned;
      if (action === 'rename') {
        payload.title = editor.elements.title.value.trim();
        if (!payload.title) { editor.elements.title.focus(); return; }
      }
      managing = true;
      options.open = false;
      get('[data-confirm]').disabled = true;
      status.textContent = '';
      updateSend();
      try {
        const changed = await save(payload);
        if (action === 'delete') {
          chats.delete(id);
          messages.delete(id);
          if (activeId === id) newChat();
          drafts.delete(id);
        } else chats.set(id, changed);
        if (activeId === id) editor.hidden = true;
      } catch (error) {
        if (activeId === id) status.textContent = error.message;
      } finally {
        managing = false;
        get('[data-confirm]').disabled = false;
        paintHistory();
        updateSend();
      }
    }
    get('[data-rename]').onclick = () => edit('rename');
    get('[data-delete]').onclick = () => edit('delete');
    get('[data-cancel]').onclick = () => { editor.hidden = true; options.querySelector('summary').focus(); };
    get('[data-pin]').onclick = () => void changeChat('pin');
    editor.onsubmit = event => { event.preventDefault(); void changeChat(editor.dataset.action); };

    get('[data-new-chat]').addEventListener('click', newChat);
    input.addEventListener('input', updateSend);
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (!send.disabled) form.requestSubmit(send);
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (send.disabled || !form.reportValidity()) return;
      const id = activeId;
      const question = input.value.trim();
      const newChat = !chats.has(id);
      pending = { id, question };
      input.value = '';
      drafts.delete(id);
      status.textContent = '';
      editor.hidden = true;
      options.open = false;
      paintHistory();
      paintTurns();
      updateSend();
      let newReply;
      try {
        const response = await save({ chatId: id, newChat, question });
        paintTokens(response.remaining);
        chats.set(id, { id, title: response.title, pinned:response.pinned, updatedAt: response.updatedAt });
        messages.get(id).push(response);
        newReply = response;
      } catch (error) {
        if (id === activeId) {
          status.textContent = error.message;
          if (!input.value) input.value = question;
        } else if (!drafts.get(id)) drafts.set(id, question);
      } finally {
        pending = undefined;
        paintHistory();
        paintTurns(newReply);
        updateSend();
      }
    });

    const latest = data.chats[0];
    if (latest) await open(latest.id);
    else {
      const id = crypto.randomUUID();
      messages.set(id, []);
      await open(id);
    }
  },
};
