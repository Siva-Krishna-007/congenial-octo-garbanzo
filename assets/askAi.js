/* Floating "Ask AI" bubble, present on every step. Answers both general
   questions and questions about uploaded Knowledge Base documents: it sends
   the question (plus the OpenRouter key/model already stored from Setup) to
   the local server, which retrieves relevant chunks from Qdrant, asks
   the configured chat provider, and logs the exchange back into Qdrant. See server/server.js.

   Also supports: picking one or more uploaded documents to summarize
   directly (no KB search involved, just the full document text), and a
   ChatGPT-style New Chat / History pair backed by localStorage. */

const AI_HISTORY_KEY = 'satsang_ask_ai_history_v1';

let aiMessages = [];        // [{role:'user'|'bot', text}] for the conversation on screen
let aiCurrentChatId = null; // null until the first exchange auto-saves it into history
let aiSelectedDocs = new Set();

/* ---------- message rendering ---------- */
function aiAppendMessage(text, who, record) {
  const messages = document.getElementById('aiPanelMessages');
  const div = document.createElement('div');
  div.className = 'ai-msg ' + (who === 'user' ? 'ai-msg-user' : 'ai-msg-bot');
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  if (record !== false) aiMessages.push({ role: who === 'user' ? 'user' : 'bot', text });
  return div;
}

function aiRenderMessagesFrom(list) {
  const messages = document.getElementById('aiPanelMessages');
  messages.innerHTML = '';
  if (!list.length) {
    messages.innerHTML = '<div class="ai-msg ai-msg-bot">Ask me anything — general questions, or about the documents you\'ve uploaded to the Knowledge Base. Use "Search all documents" above to scope a question to specific files.</div>';
    return;
  }
  list.forEach(m => {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + (m.role === 'user' ? 'ai-msg-user' : 'ai-msg-bot');
    div.textContent = m.text;
    messages.appendChild(div);
  });
  messages.scrollTop = messages.scrollHeight;
}

/* ---------- asking a question (KB-grounded, via the server) ---------- */
async function aiSendQuestion() {
  const input = document.getElementById('aiPanelInput');
  const sendBtn = document.getElementById('aiPanelSend');
  const question = input.value.trim();
  if (!question) return;
  if (!chatReady()) { showToast('Set up a chat model (OpenRouter key, Ollama, or Custom API) in Setup first.', true); goToStep(1); return; }
  if (!embedReady()) { showToast('Set up an embedding model (OpenRouter key, Ollama, or Custom API) in Setup first.', true); goToStep(1); return; }

  aiAppendMessage(question, 'user');
  input.value = '';
  input.disabled = true;
  sendBtn.disabled = true;
  const thinkingEl = aiAppendMessage('Thinking...', 'bot', false);
  const messagesEl = document.getElementById('aiPanelMessages');

  try {
    const res = await fetch(KB_API_BASE + '/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        apiKey: STATE.settings.apiKey,
        model: activeModel(),
        embedModel: activeEmbedModel(),
        chatProvider: STATE.settings.chatProvider,
        embedProvider: STATE.settings.embedProvider,
        ollamaUrl: STATE.settings.ollamaUrl,
        customApiUrl: STATE.settings.customApiUrl,
        customApiKey: STATE.settings.customApiKey,
        nvidiaApiKey: STATE.settings.nvidiaApiKey,
        sources: Array.from(aiSelectedDocs),
        history: aiMessages.slice(0, -1), // everything before the question just appended above
        ollamaContextLength: STATE.settings.ollamaContextLength
      })
    });

    if (!res.ok) {
      // Validation errors (missing key/model, etc.) arrive as plain JSON,
      // before any streaming starts.
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || ('HTTP ' + res.status));
    }

    // Everything past this point streams in as Server-Sent Events -- each
    // "data: {...}" line is one event; render each answer delta into the
    // bubble as it arrives instead of waiting for the whole response.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let meta = { usedKnowledgeBase: false, sources: [] };
    let streamError = null;
    let gotFirstDelta = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        let evt;
        try { evt = JSON.parse(payload); } catch (e) { continue; }
        if (evt.type === 'meta') {
          meta = evt;
        } else if (evt.type === 'delta') {
          if (!gotFirstDelta) { gotFirstDelta = true; thinkingEl.textContent = ''; }
          answer += evt.text;
          thinkingEl.textContent = answer;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        } else if (evt.type === 'error') {
          streamError = evt.error;
        }
        // 'done' needs no handling -- the loop just ends when the stream closes.
      }
    }

    if (streamError) throw new Error(streamError);
    if (!answer) throw new Error('No answer was returned.');

    if (meta.usedKnowledgeBase && meta.sources && meta.sources.length) {
      answer += '\n\n(Sourced from: ' + meta.sources.join(', ') + ')';
      thinkingEl.textContent = answer;
    }
    aiMessages.push({ role: 'bot', text: answer });
    aiPersistCurrentChat();
  } catch (e) {
    console.error('Ask AI error', e);
    thinkingEl.textContent = 'Sorry, I could not answer that: ' + e.message;
    thinkingEl.classList.add('ai-msg-error');
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

/* ---------- document picker: scopes Ask AI's RAG search ----------
   Checking documents here restricts what Ask AI searches for the next
   question(s) -- it does NOT trigger anything by itself (no API call on
   selection), only the "Send" button does. Leave nothing checked to search
   the whole active collection as usual. */
async function aiRenderDocsList() {
  const list = document.getElementById('aiDocsList');
  if (!list) return;
  try {
    const res = await fetch(KB_API_BASE + '/api/kb/documents');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not list documents.');
    const docs = data.documents || [];
    // Drop selections for files that no longer exist (e.g. removed elsewhere).
    const stillThere = new Set(docs.map(d => d.source));
    aiSelectedDocs.forEach(name => { if (!stillThere.has(name)) aiSelectedDocs.delete(name); });

    if (!docs.length) {
      list.innerHTML = '<div class="ai-history-empty">No documents uploaded yet — add some in the Knowledge Base step.</div>';
    } else {
      list.innerHTML = docs.map(d => `
        <div class="ai-doc-checkbox-row">
          <input type="checkbox" id="aiDocCk_${escapeAttr(d.source)}" ${aiSelectedDocs.has(d.source) ? 'checked' : ''} data-ai-doc="${escapeAttr(d.source)}">
          <label for="aiDocCk_${escapeAttr(d.source)}" title="${escapeAttr(d.source)}">${escapeHtml(d.source)}</label>
        </div>
      `).join('');
      list.querySelectorAll('[data-ai-doc]').forEach(ck => {
        ck.addEventListener('change', () => {
          if (ck.checked) aiSelectedDocs.add(ck.dataset.aiDoc); else aiSelectedDocs.delete(ck.dataset.aiDoc);
          aiUpdateDocsToggleLabel();
        });
      });
    }
  } catch (e) {
    console.error('Ask AI docs list error', e);
    list.innerHTML = `<div class="ai-history-empty">Could not reach the local KB server: ${escapeHtml(e.message)}</div>`;
  }
  aiUpdateDocsToggleLabel();
}

function aiUpdateDocsToggleLabel() {
  const toggle = document.getElementById('aiDocsToggle');
  if (!toggle) return;
  toggle.textContent = aiSelectedDocs.size
    ? `Searching ${aiSelectedDocs.size} selected document${aiSelectedDocs.size === 1 ? '' : 's'} ▾`
    : 'Search all documents ▾';
}

/* ---------- chat history (localStorage, auto-saves as you go) ---------- */
function aiLoadHistory() {
  try {
    const raw = localStorage.getItem(AI_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Could not read Ask AI history', e);
    return [];
  }
}

function aiSaveHistory(list) {
  try { localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(list)); } catch (e) { console.warn('Could not save Ask AI history', e); }
}

function aiPersistCurrentChat() {
  if (!aiMessages.length) return;
  const history = aiLoadHistory();
  const firstUser = aiMessages.find(m => m.role === 'user');
  const title = (firstUser ? firstUser.text : 'New chat').slice(0, 60);
  if (aiCurrentChatId) {
    const idx = history.findIndex(h => h.id === aiCurrentChatId);
    if (idx >= 0) {
      history[idx] = Object.assign({}, history[idx], { title, messages: aiMessages, updatedAt: new Date().toISOString() });
    } else {
      history.unshift({ id: aiCurrentChatId, title, messages: aiMessages, updatedAt: new Date().toISOString() });
    }
  } else {
    aiCurrentChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    history.unshift({ id: aiCurrentChatId, title, messages: aiMessages, updatedAt: new Date().toISOString() });
  }
  aiSaveHistory(history);
}

function aiNewChat() {
  aiMessages = [];
  aiCurrentChatId = null;
  aiSelectedDocs.clear();
  aiRenderMessagesFrom([]);
  setHistoryDropdownOpen(false);
  aiUpdateDocsToggleLabel();
}

function aiLoadChat(id) {
  const history = aiLoadHistory();
  const entry = history.find(h => h.id === id);
  if (!entry) return;
  aiMessages = entry.messages.slice();
  aiCurrentChatId = entry.id;
  aiRenderMessagesFrom(aiMessages);
  setHistoryDropdownOpen(false);
}

function aiDeleteChat(id, evt) {
  if (evt) evt.stopPropagation();
  let history = aiLoadHistory();
  history = history.filter(h => h.id !== id);
  aiSaveHistory(history);
  if (aiCurrentChatId === id) aiNewChat();
  aiRenderHistoryList();
}

function aiRenderHistoryList() {
  const wrap = document.getElementById('aiHistoryDropdown');
  if (!wrap) return;
  const history = aiLoadHistory();
  if (!history.length) {
    wrap.innerHTML = '<div class="ai-history-empty">No past chats yet.</div>';
    return;
  }
  wrap.innerHTML = history
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(h => `
      <div class="ai-history-row" data-ai-load="${escapeAttr(h.id)}">
        <span class="ai-history-row-title">${escapeHtml(h.title || 'Chat')}</span>
        <span class="ai-history-row-date">${new Date(h.updatedAt).toLocaleDateString()}</span>
        <button class="ai-history-row-delete" data-ai-delete="${escapeAttr(h.id)}" title="Delete">&times;</button>
      </div>
    `).join('');
  wrap.querySelectorAll('[data-ai-load]').forEach(row => {
    row.addEventListener('click', () => aiLoadChat(row.dataset.aiLoad));
  });
  wrap.querySelectorAll('[data-ai-delete]').forEach(btn => {
    btn.addEventListener('click', e => aiDeleteChat(btn.dataset.aiDelete, e));
  });
}

/* ---------- panel open/close + wiring ---------- */
function aiTogglePanel(forceOpen) {
  const panel = document.getElementById('aiPanel');
  const shouldOpen = forceOpen !== undefined ? forceOpen : panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !shouldOpen);
  if (shouldOpen) {
    kbCheckHealth();
    aiRenderDocsList();
    document.getElementById('aiPanelInput').focus();
  }
}

function wireAskAi() {
  const fab = document.getElementById('aiFab');
  const closeBtn = document.getElementById('aiPanelClose');
  const sendBtn = document.getElementById('aiPanelSend');
  const input = document.getElementById('aiPanelInput');
  const docsToggle = document.getElementById('aiDocsToggle');
  const docsDropdown = document.getElementById('aiDocsDropdown');
  const historyBtn = document.getElementById('aiHistoryBtn');
  const historyDropdown = document.getElementById('aiHistoryDropdown');
  const newChatBtn = document.getElementById('aiNewChatBtn');
  if (!fab) return;

  fab.addEventListener('click', () => aiTogglePanel());
  closeBtn.addEventListener('click', () => aiTogglePanel(false));
  sendBtn.addEventListener('click', aiSendQuestion);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') aiSendQuestion(); });

  docsToggle.addEventListener('click', () => {
    setHistoryDropdownOpen(false);
    const nowHidden = docsDropdown.classList.toggle('hidden');
    if (!nowHidden) aiRenderDocsList();
  });

  historyBtn.addEventListener('click', () => {
    docsDropdown.classList.add('hidden');
    setHistoryDropdownOpen(historyDropdown.classList.contains('hidden')); // toggle to the opposite of its current state
    if (!historyDropdown.classList.contains('hidden')) aiRenderHistoryList();
  });
  newChatBtn.addEventListener('click', aiNewChat);
}

// Keeps the History button's ▾/▴ arrow in sync with whether its dropdown is
// actually open, regardless of what closed/opened it (its own button, the
// Documents toggle closing it, or picking a chat from the list).
function setHistoryDropdownOpen(open) {
  const dropdown = document.getElementById('aiHistoryDropdown');
  const arrow = document.getElementById('aiHistoryArrow');
  if (dropdown) dropdown.classList.toggle('hidden', !open);
  if (arrow) arrow.textContent = open ? '▴' : '▾';
}
