import { mountDeclared } from '../features/ledger-bot/index.js';
import { node, formatDate, formatResetCountdown } from './workspace-ui.js';
import './coach-page.css';

export const coach = {
  title: 'AI Coach',
  description: 'Ask questions about your trading process.',
  content: `<div class="coach-layout">
    <aside class="n-out ws-card coach-sidebar">
      <button type="button" class="btn btn-primary" data-new-chat>+ New chat</button>
      <nav aria-label="Past chats" data-chat-history></nav>
    </aside>
    <section class="n-out ws-card ws-coach">
      <header class="ws-section-head"><span data-ledger="calm" data-size="44" data-decor></span>
        <div><h2 data-chat-title>New chat</h2><p data-chat-connection></p></div>
        <details class="coach-options" data-options hidden>
          <summary aria-label="Chat options">•••</summary>
          <div><button type="button" class="btn btn-ghost" data-rename>Rename chat</button><button type="button" class="btn btn-ghost" data-pin>Pin chat</button><button type="button" class="btn btn-danger" data-delete>Delete chat</button></div>
        </details>
      </header>
      <form class="coach-edit" data-edit hidden>
        <label data-rename-label>Chat name <input name="title" maxlength="80" autocomplete="off"></label>
        <span data-delete-label hidden>Delete this chat and its messages permanently?</span>
        <div><button class="btn btn-secondary" type="button" data-cancel>Cancel</button>
        <button class="btn btn-primary" type="submit" data-confirm>Save name</button></div>
      </form>
      <div class="ws-chat" role="log" aria-label="Conversation" data-coach-chat></div>
      <form class="ws-form" data-coach-form>
        <label class="ws-visually-hidden" for="coach-question">Message Ledger</label>
        <div class="coach-attachments" data-coach-attachments hidden></div>
        <div class="coach-composer">
          <input type="file" data-coach-files accept="image/png,image/jpeg,image/webp,.csv,.txt,.md,.json,.html,.htm" multiple hidden>
          <button type="button" class="btn btn-ghost coach-attach-btn" data-coach-attach aria-label="Attach files or images" title="Attach files or images"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>
          <textarea id="coach-question" name="question" rows="2" maxlength="600" placeholder="Message Ledger or drop a chart / file…"></textarea>
          <button type="submit" class="btn btn-primary" aria-label="Send message" title="Send message">↑</button>
        </div>
        <div class="coach-composer-meta"><small>Enter to send · Shift+Enter for a new line</small><div class="coach-usage" data-coach-usage><button type="button" class="btn btn-ghost coach-usage-trigger" aria-expanded="false" aria-controls="coach-usage-card">Usage</button><div id="coach-usage-card" class="n-out coach-usage-card" role="dialog" aria-label="AI usage limits" hidden></div></div></div>
        <small data-coach-consent></small>
      </form>
      <p data-coach-status role="status"></p>
    </section>
  </div>`,
  async bind(page, { data, save, request }) {
    mountDeclared(page);
    const get = (selector) => page.querySelector(selector);
    const form = get('[data-coach-form]');
    const input = form.elements.question;
    const send = form.querySelector('button[type=submit]');
    const fileInput = form.querySelector('[data-coach-files]');
    const attachBtn = form.querySelector('[data-coach-attach]');
    const attachStrip = form.querySelector('[data-coach-attachments]');
    const composerBox = form.querySelector('.coach-composer');
    let attachments = [];
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
    const usageBox = get('[data-coach-usage]');
    const usageTrigger = usageBox.querySelector('.coach-usage-trigger');
    const usageCard = usageBox.querySelector('#coach-usage-card');
    const fallbackThreeDayReset = () => new Date((Math.floor(Date.now() / (3 * 86_400_000)) + 1) * 3 * 86_400_000).toISOString();
    const fallbackIstReset = () => new Date((Math.floor((Date.now() + 330 * 60_000) / 86_400_000) + 1) * 86_400_000 - 330 * 60_000).toISOString();
    const usageState = { ...(data.usage ?? {}), remaining: data.tokens?.remaining, tokenLimit: data.tokens?.limit, window: data.tokens?.window, tokenResetsAt: data.tokens?.resetsAt, month: data.tokens?.month, hour: data.tokens?.hour };
    let usagePinned = false;
    function renderUsageCard() {
      const rows = [];
      if (Number.isFinite(usageState.limit)) {
        const m = document.createElement('meter'); m.min = 0; m.max = Math.max(1, usageState.limit); m.value = usageState.used ?? 0;
        const r = node('div', '', 'coach-usage-row');
        r.append(node('span', usageState.feature || 'Ask your journal'), node('strong', `${usageState.used ?? 0} of ${usageState.limit}`), m);
        const resetLabel = formatResetCountdown(usageState.resetsAt || fallbackThreeDayReset());
        if (resetLabel) r.append(node('small', resetLabel, 'coach-usage-reset'));
        rows.push(r);
      }
      if (Number.isInteger(usageState.remaining)) {
        const cap = usageState.tokenLimit || Math.max(1, usageState.remaining);
        const spent = Math.max(0, cap - usageState.remaining);
        const m = document.createElement('meter'); m.min = 0; m.max = cap; m.value = spent;
        const label = usageState.window === 'day' ? 'AI tokens today' : usageState.window === 'hour' ? 'AI tokens this hour' : 'AI tokens this month';
        const r = node('div', '', 'coach-usage-row');
        r.append(node('span', label), node('strong', `${usageState.remaining.toLocaleString()} left`), m);
        const resetLabel = formatResetCountdown(usageState.tokenResetsAt || (usageState.window === 'day' ? fallbackIstReset() : null));
        if (resetLabel) r.append(node('small', resetLabel, 'coach-usage-reset'));
        rows.push(r);
      }
      const foot = node('div', '', 'coach-usage-foot');
      const link = node('a', 'View all limits & billing →'); link.href = '/billing#usage';
      foot.append(node('span', 'Plan: ' + (usageState.plan ? usageState.plan[0].toUpperCase() + usageState.plan.slice(1) : 'Free')), link);
      usageCard.replaceChildren(...rows, foot);
    }
    const setUsageOpen = (open) => {
      usageCard.hidden = !open;
      usageTrigger.setAttribute('aria-expanded', String(open));
    };
    usageTrigger.addEventListener('click', (e) => { e.stopPropagation(); usagePinned = !usagePinned; setUsageOpen(usagePinned); });
    usageBox.addEventListener('pointerenter', () => setUsageOpen(true));
    usageBox.addEventListener('pointerleave', () => { if (!usagePinned) setUsageOpen(false); });
    usageBox.addEventListener('focusin', () => setUsageOpen(true));
    usageBox.addEventListener('focusout', (e) => { if (!usageBox.contains(e.relatedTarget) && !usagePinned) setUsageOpen(false); });
    document.addEventListener('click', (e) => { if (usagePinned && !usageBox.contains(e.target)) { usagePinned = false; setUsageOpen(false); } });
    function paintTokens(remaining) {
      if (Number.isInteger(remaining)) usageState.remaining = remaining;
      renderUsageCard();
    }
    renderUsageCard();

    function appendInlineMarkdown(target, text) {
      const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|`[^`\n]+`)/g;
      let last = 0;
      for (const match of text.matchAll(pattern)) {
        if (match.index > last) target.append(document.createTextNode(text.slice(last, match.index)));
        const token = match[0];
        if (token.startsWith('**') || token.startsWith('__')) {
          target.append(node('strong', token.slice(2, -2)));
        } else if (token.startsWith('`')) {
          target.append(node('code', token.slice(1, -1)));
        } else {
          target.append(node('em', token.slice(1, -1)));
        }
        last = match.index + token.length;
      }
      if (last < text.length) target.append(document.createTextNode(text.slice(last)));
    }

    function renderCoachMarkdown(text) {
      const frag = document.createDocumentFragment();
      const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
      let list = null;
      let listType = '';
      let para = [];
      const flushPara = () => {
        if (!para.length) return;
        const p = document.createElement('p');
        para.forEach((line, idx) => {
          if (idx > 0) p.append(document.createElement('br'));
          appendInlineMarkdown(p, line);
        });
        frag.append(p);
        para = [];
      };
      const flushList = () => {
        if (!list) return;
        frag.append(list);
        list = null;
        listType = '';
      };
      for (const raw of lines) {
        const line = raw.trimEnd();
        const trimmed = line.trim();
        if (!trimmed) {
          flushPara();
          flushList();
          continue;
        }
        const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          flushPara();
          flushList();
          const h = document.createElement(heading[1].length === 1 ? 'h3' : 'h4');
          appendInlineMarkdown(h, heading[2]);
          frag.append(h);
          continue;
        }
        const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
        if (ordered) {
          flushPara();
          if (listType !== 'ol') {
            flushList();
            list = document.createElement('ol');
            listType = 'ol';
          }
          const li = document.createElement('li');
          appendInlineMarkdown(li, ordered[1]);
          list.append(li);
          continue;
        }
        const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
        if (bullet) {
          flushPara();
          if (listType !== 'ul') {
            flushList();
            list = document.createElement('ul');
            listType = 'ul';
          }
          const li = document.createElement('li');
          appendInlineMarkdown(li, bullet[1]);
          list.append(li);
          continue;
        }
        flushList();
        para.push(trimmed);
      }
      flushPara();
      flushList();
      return frag;
    }

    function paintTurns(newReply) {
      conversation.replaceChildren();
      for (const turn of messages.get(activeId) || []) {
        const reply = node('article', '', 'n-in ws-list-card coach-reply-card' + (turn.isError ? ' is-error' : ''));
        const body = node('div', '', 'coach-reply-body');
        body.append(renderCoachMarkdown(turn.answer));
        reply.append(node('strong', 'Ledger', 'coach-reply-author'), body);
        if (turn === newReply && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const visible = node('p', '');
          visible.setAttribute('aria-hidden','true');
          body.replaceChildren(node('span', turn.answer, 'ws-visually-hidden'), visible);
          const chars = Array.from(turn.answer);
          const start = performance.now();
          const duration = Math.min(2200, chars.length * 22);
          function reveal(now) {
            if (!body.isConnected) return;
            const nearBottom = conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 48;
            const end = Math.ceil(chars.length * Math.min(1, (now - start) / duration));
            if (end >= chars.length) {
              body.replaceChildren(renderCoachMarkdown(turn.answer));
              if (nearBottom) conversation.scrollTop = conversation.scrollHeight;
              return;
            }
            visible.textContent = chars.slice(0,end).join('').replace(/\*\*|__/g, '');
            if (nearBottom) conversation.scrollTop = conversation.scrollHeight;
            requestAnimationFrame(reveal);
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
        const loader = node('article', '', 'n-in ws-list-card coach-reply-card coach-loader-card');
        loader.setAttribute('role', 'status');
        loader.setAttribute('aria-live', 'polite');
        loader.setAttribute('aria-busy', 'true');
        const head = node('div', '', 'coach-loader-head');
        const spin = node('span', '', 'coach-loader-spinner');
        spin.setAttribute('aria-hidden', 'true');
        const stageText = node('strong', pending.hasAttachments ? 'Reading attached files & reviewing…' : 'Reviewing your journal & context…', 'coach-loader-label');
        head.append(spin, stageText);
        const bar = node('div', '', 'ux-indeterminate-bar');
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-label', 'AI response in progress');
        const sk1 = node('div', '', 'ux-skeleton-line');
        const sk2 = node('div', '', 'ux-skeleton-line is-short');
        loader.append(head, bar, sk1, sk2);
        const t1 = setTimeout(() => { if (stageText.isConnected) stageText.textContent = 'Analyzing patterns and drafting a response…'; }, 4000);
        const t2 = setTimeout(() => { if (stageText.isConnected) stageText.textContent = 'Still working — AI responses can take a few extra seconds…'; }, 10000);
        loader.dataset.timers = `${t1},${t2}`;
        conversation.append(node('p', pending.question, 'coach-question'), loader);
      }
      if (messages.has(activeId) && !conversation.childElementCount) {
        conversation.append(node('p', 'Send a message to start this chat.', 'ws-empty'));
      }
      conversation.scrollTop = conversation.scrollHeight;
    }

    function paintHistory() {
      const ordered = [...chats.values()].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));
      history.replaceChildren(node('h3', 'Past chats'), ...ordered.map((chat) => {
        const button = node('button', '', 'btn btn-ghost');
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
        const button = node('button', 'Unsent chat', 'btn btn-ghost');
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
      send.disabled = !data.available || Boolean(pending) || managing || !messages.has(activeId) || (!input.value.trim() && !attachments.length);
    }

    function renderAttachments() {
      attachStrip.hidden = attachments.length === 0;
      attachStrip.replaceChildren(...attachments.map((item, idx) => {
        const chip = node('div', '', 'coach-attach-chip');
        if (item.dataUrl) {
          const img = document.createElement('img');
          img.src = item.dataUrl;
          img.alt = item.name;
          chip.append(img);
        }
        chip.append(node('span', item.name));
        const rem = node('button', '×', 'coach-attach-remove');
        rem.type = 'button';
        rem.setAttribute('aria-label', `Remove ${item.name}`);
        rem.onclick = () => { attachments.splice(idx, 1); renderAttachments(); updateSend(); };
        chip.append(rem);
        return chip;
      }));
    }

    async function encodeImageDataUrl(file) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      try {
        img.src = url;
        await img.decode();
        const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.85);
      } finally { URL.revokeObjectURL(url); }
    }

    async function addCoachFiles(fileList) {
      for (const file of Array.from(fileList || [])) {
        if (attachments.length >= 3) { status.textContent = 'Attach up to 3 files or images per message.'; break; }
        if (/^image\/(png|jpeg|webp)$/i.test(file.type)) {
          if (file.size > 12 * 1024 * 1024) { status.textContent = `${file.name}: image exceeds 12 MB.`; continue; }
          try {
            const dataUrl = await encodeImageDataUrl(file);
            attachments.push({ name: file.name || 'image.jpg', type: 'image/jpeg', dataUrl });
          } catch { status.textContent = `Could not read ${file.name}.`; }
        } else if (/\.(csv|txt|md|json|html|htm)$/i.test(file.name) || file.type.startsWith('text/')) {
          if (file.size > 1_500_000) { status.textContent = `${file.name}: file exceeds 1.5 MB.`; continue; }
          const text = (await file.text()).slice(0, 20_000);
          attachments.push({ name: file.name, type: file.type || 'text/plain', text });
        } else {
          status.textContent = `${file.name}: attach PNG/JPG/WebP images or CSV/TXT/MD/JSON/HTML files.`;
        }
      }
      renderAttachments();
      updateSend();
    }

    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { void addCoachFiles(fileInput.files); fileInput.value = ''; });
    composerBox.addEventListener('dragover', (e) => { e.preventDefault(); composerBox.classList.add('is-dragging'); });
    composerBox.addEventListener('dragleave', (e) => { if (!composerBox.contains(e.relatedTarget)) composerBox.classList.remove('is-dragging'); });
    composerBox.addEventListener('drop', (e) => { e.preventDefault(); composerBox.classList.remove('is-dragging'); void addCoachFiles(e.dataTransfer?.files); });
    input.addEventListener('paste', (e) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length) void addCoachFiles(files);
    });

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
      const typed = input.value.trim();
      const outgoingAttachments = attachments.slice();
      if (!typed && !outgoingAttachments.length) return;
      const question = typed || 'Analyze the attached file(s).';
      const displayQuestion = typed + (outgoingAttachments.length ? `\n[Attached: ${outgoingAttachments.map((a) => a.name).join(', ')}]` : '');
      const newChat = !chats.has(id);
      pending = { id, question: displayQuestion, hasAttachments: outgoingAttachments.length > 0 };
      input.value = '';
      attachments = [];
      renderAttachments();
      drafts.delete(id);
      status.textContent = '';
      editor.hidden = true;
      options.open = false;
      paintHistory();
      paintTurns();
      updateSend();
      let newReply;
      try {
        const response = await save({ chatId: id, newChat, question, attachments: outgoingAttachments });
        if (Number.isFinite(usageState.used)) usageState.used += 1;
        paintTokens(response.remaining);
        chats.set(id, { id, title: response.title, pinned:response.pinned, updatedAt: response.updatedAt });
        messages.get(id).push(response);
        newReply = response;
      } catch (error) {
        const fallbackText = error.message || 'I cannot help with this right now. Please try again.';
        const turns = messages.get(id);
        if (turns) {
          turns.push({ question: displayQuestion, answer: fallbackText, sources: [], isError: true });
        } else if (id === activeId) {
          status.textContent = fallbackText;
        }
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
