/* UI glue. Reads/writes STATE, calls into costing.js / openrouter.js / docxExport.js. */

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function showToast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), 4200);
}

/* ---------- Step navigation ---------- */
// Convenience prev/next buttons at the bottom of each of the 4 main steps
// (Setup/Document/Team&Tools/Review&Export), purely additive -- every step
// stays reachable via the sidebar rail regardless, same as before. Pending
// and Admin are deliberately left out of this linear chain.
function wireStepNavArrows() {
  $all('[data-nav-prev]').forEach(btn => btn.addEventListener('click', () => goToStep(btn.dataset.navPrev)));
  $all('[data-nav-next]').forEach(btn => btn.addEventListener('click', () => goToStep(btn.dataset.navNext)));
}

// Gates Team & Tools: the checklist for the currently selected document
// type + Template Library category must be run AND every item explicitly
// agreed or declined (N/A) before proceeding, plus there needs to be a
// Detailed Requirement Document to work from either way.
function isTeamToolsUnlocked() {
  return !!STATE.drdText.trim() && checklistFullyResolved();
}

function goToStep(step) {
  step = String(step);
  if (step === '3' && !isTeamToolsUnlocked()) {
    showToast('Resolve every checklist item (Agree or Decline each one) in the Document step before proceeding to Team & Tools.', true);
    return;
  }
  $all('.step').forEach(s => s.classList.add('hidden'));
  const target = $('#step-' + step);
  if (target) target.classList.remove('hidden');
  $all('.rail-step').forEach(b => b.classList.toggle('active', b.dataset.step === step));
  if (step === '2') populateDomainSelect();
  if (step === '3') { populateMemberSelect(); populateToolSelects(); renderTeamTable(); renderToolTable(); renderCostingSummary(); }
  if (step === '4') { renderReviewStep(); renderProposalPreview(); renderSowPreview(); }
  if (step === '5') renderKnowledgeBase();
  if (step === 'pending') renderPendingList();
  if (step === 'admin') renderAdminTabs();
  updateStepReadiness();
  window.scrollTo(0, 0);
}

// Marks each of the 5 main rail steps "ready" (a gentle green blink) once
// there's something meaningful done in it for the CURRENT document, so
// re-checking every step by hand isn't necessary. Purely a signal, not a
// gate -- every step stays clickable regardless.
function updateStepReadiness() {
  const readiness = {
    1: chatReady(),
    2: !!(STATE.drdText && STATE.drdText.trim()),
    3: STATE.team.some(m => m.included) && STATE.tools.some(t => t.included),
    4: !!(STATE.proposal || STATE.sowHtml),
    5: (typeof kbLastKnownDocCount === 'number' ? kbLastKnownDocCount > 0 : false)
  };
  $all('.rail-step').forEach(btn => {
    const step = Number(btn.dataset.step);
    if (!readiness.hasOwnProperty(step)) return;
    btn.classList.toggle('step-ready', !!readiness[step]);
  });
  updateTeamToolsGateUi();
}

// Visually greys out the Team & Tools rail step and the in-page "Proceed to
// Team & Tools" button/arrow until isTeamToolsUnlocked() is true -- the
// PRD/DRD has been checked against the selected template and every
// checklist item has been agreed or declined.
function updateTeamToolsGateUi() {
  const unlocked = isTeamToolsUnlocked();
  const railBtn = $all('.rail-step').find(b => b.dataset.step === '3');
  if (railBtn) railBtn.classList.toggle('step-locked', !unlocked);
  const proceedBtn = $('#drdProceedToTeamBtn');
  if (proceedBtn) {
    proceedBtn.disabled = !unlocked;
    proceedBtn.title = unlocked ? '' : 'Resolve every checklist item (Agree or Decline each one) above before proceeding.';
  }
  const nextArrow = $all('[data-nav-next]').find(b => b.dataset.navNext === '3');
  if (nextArrow) {
    nextArrow.disabled = !unlocked;
    nextArrow.title = unlocked ? '' : 'Resolve every checklist item (Agree or Decline each one) above before proceeding.';
  }
  const status = $('#drdProceedStatus');
  if (status) status.textContent = unlocked ? '' : 'Locked — resolve every checklist item (Agree or Decline) in the Document step first.';
}

function wireNav() {
  $all('.rail-step').forEach(btn => {
    btn.addEventListener('click', () => goToStep(btn.dataset.step));
  });
  $('#newProposalBtn').addEventListener('click', startNewProposal);
}

// Clears everything about the current working document (document, Q&A, team,
// tools, proposal, edits) without touching Setup. Reflects the reset in the
// DOM immediately, wherever the user currently is.
function resetSessionFields() {
  const fresh = freshSessionState();
  STATE.client = fresh.client;
  STATE.docType = fresh.docType;
  STATE.templateId = fresh.templateId;
  STATE.prelimText = fresh.prelimText;
  STATE.uploadedFileName = fresh.uploadedFileName;
  STATE.checklist = fresh.checklist;
  STATE.checklistReady = fresh.checklistReady;
  STATE.domainTools = fresh.domainTools;
  STATE.aiSuggestions = fresh.aiSuggestions;
  STATE.toolFit = fresh.toolFit;
  STATE.qa = fresh.qa;
  STATE.drdText = fresh.drdText;
  STATE.drd = fresh.drd;
  STATE.drdHtml = fresh.drdHtml;
  STATE.solutions = fresh.solutions;
  STATE.team = fresh.team;
  STATE.tools = fresh.tools;
  STATE.proposal = null;
  STATE.editedHtml = null;
  STATE.sow = null;
  STATE.sowHtml = null;
  STATE.pendingId = null;
  persist();

  const prelimEl = $('#prelimText');
  if (prelimEl) prelimEl.value = '';
  const parseStatusEl = $('#parseStatus');
  if (parseStatusEl) parseStatusEl.textContent = '';
  const fileInputEl = $('#fileInput');
  if (fileInputEl) fileInputEl.value = '';
  const dropzoneLabelEl = $('#dropzoneLabel');
  if (dropzoneLabelEl) dropzoneLabelEl.textContent = 'Drop a .pdf or .docx here, or click to choose a file';
  const docTypeEl = $('#docTypeSelect');
  if (docTypeEl) docTypeEl.value = 'preliminary';
  renderQaSections();
  renderDomainToolsList();
  const checklistCardEl = $('#checklistCard'); if (checklistCardEl) checklistCardEl.style.display = 'none';
  const aiStatusEl = $('#aiVerifyStatus'); if (aiStatusEl) aiStatusEl.textContent = '';
  const suggestionsEl = $('#aiSuggestions'); if (suggestionsEl) suggestionsEl.innerHTML = '';
  checklistFilter = 'all';
  checklistEditingSet.clear();
  updateSendToAiState();
  updateDocTypeUI();
}

function startNewProposal() {
  if (!window.confirm('Start a new proposal? This clears the uploaded document, client details, team, tools, and any generated proposal. Your API key and Setup defaults stay as they are.')) return;
  try {
    resetSessionFields();
  } catch (e) {
    console.error('Reset failed', e);
    showToast('Reset ran into an error (see console) — navigating anyway.', true);
  }
  showToast('Started a new proposal.');
  goToStep(2);
}

/* ---------- Step 1: Setup ---------- */
function wireSetup() {
  $('#apiKey').value = STATE.settings.apiKey;
  $('#modelSelect').value = STATE.settings.model;
  $('#customModel').value = STATE.settings.customModel;
  $('#customModelWrap').style.display = STATE.settings.model === '__custom__' ? 'flex' : 'none';
  $('#embedModelSelect').value = STATE.settings.embedModel;
  $('#customEmbedModel').value = STATE.settings.customEmbedModel;
  $('#customEmbedModelWrap').style.display = STATE.settings.embedModel === '__custom__' ? 'flex' : 'none';
  $('#ollamaUrl').value = STATE.settings.ollamaUrl;
  $('#customApiUrl').value = STATE.settings.customApiUrl;
  $('#customApiKey').value = STATE.settings.customApiKey;
  $('#customApiChatModel').value = STATE.settings.customApiChatModel;
  $('#customApiEmbedModel').value = STATE.settings.customApiEmbedModel;
  $('#nvidiaApiKey').value = STATE.settings.nvidiaApiKey;
  $('#nvidiaChatModel').value = STATE.settings.nvidiaChatModel;
  $('#nvidiaEmbedModel').value = STATE.settings.nvidiaEmbedModel;
  applyProviderUI('chat', STATE.settings.chatProvider);
  applyProviderUI('embed', STATE.settings.embedProvider);
  $('#providerName').value = STATE.settings.providerName;
  $('#providerLocation').value = STATE.settings.providerLocation;
  $('#providerAbout').value = STATE.settings.providerAbout;
  $('#providerTagline').value = STATE.settings.providerTagline;
  $('#gstPercent').value = STATE.settings.gstPercent;
  $('#validityDays').value = STATE.settings.validityDays;
  $('#currencySymbol').value = STATE.settings.currencySymbol;
  $('#pctAdvance').value = STATE.settings.pctAdvance;
  $('#pctSignoff').value = STATE.settings.pctSignoff;
  $('#pctGolive').value = STATE.settings.pctGolive;
  updateStatusPill();

  // If a provider is already set to Ollama (e.g. returning to Setup, or a
  // reloaded page), fetch its model list right away so the dropdown isn't
  // just sitting there empty/showing "click refresh".
  if (isOllamaChat()) refreshOllamaModels('chat');
  if (isOllamaEmbed()) refreshOllamaModels('embed');

  const bindings = [
    ['apiKey', 'apiKey'], ['providerName', 'providerName'], ['providerLocation', 'providerLocation'],
    ['providerAbout', 'providerAbout'], ['providerTagline', 'providerTagline'], ['gstPercent', 'gstPercent'], ['validityDays', 'validityDays'],
    ['currencySymbol', 'currencySymbol'], ['pctAdvance', 'pctAdvance'], ['pctSignoff', 'pctSignoff'],
    ['pctGolive', 'pctGolive'], ['customModel', 'customModel'], ['customEmbedModel', 'customEmbedModel'],
    ['ollamaUrl', 'ollamaUrl'], ['customApiUrl', 'customApiUrl'], ['customApiKey', 'customApiKey'],
    ['customApiChatModel', 'customApiChatModel'], ['customApiEmbedModel', 'customApiEmbedModel'],
    ['nvidiaApiKey', 'nvidiaApiKey'], ['nvidiaChatModel', 'nvidiaChatModel'], ['nvidiaEmbedModel', 'nvidiaEmbedModel']
  ];
  bindings.forEach(([id, key]) => {
    $('#' + id).addEventListener('input', e => {
      STATE.settings[key] = e.target.value;
      persist();
      if (id === 'apiKey' || id === 'customApiChatModel' || id === 'customApiUrl' || id === 'customApiKey' || id === 'nvidiaApiKey' || id === 'nvidiaChatModel') updateStatusPill();
    });
  });
  $('#modelSelect').addEventListener('change', e => {
    STATE.settings.model = e.target.value;
    $('#customModelWrap').style.display = e.target.value === '__custom__' ? 'flex' : 'none';
    persist();
  });
  $('#embedModelSelect').addEventListener('change', e => {
    STATE.settings.embedModel = e.target.value;
    $('#customEmbedModelWrap').style.display = e.target.value === '__custom__' ? 'flex' : 'none';
    persist();
  });

  $('#chatProviderOpenRouterBtn').addEventListener('click', () => setProvider('chat', 'openrouter'));
  $('#chatProviderOllamaBtn').addEventListener('click', () => setProvider('chat', 'ollama'));
  $('#chatProviderCustomBtn').addEventListener('click', () => setProvider('chat', 'custom'));
  $('#chatProviderNvidiaBtn').addEventListener('click', () => setProvider('chat', 'nvidia'));
  $('#embedProviderOpenRouterBtn').addEventListener('click', () => setProvider('embed', 'openrouter'));
  $('#embedProviderOllamaBtn').addEventListener('click', () => setProvider('embed', 'ollama'));
  $('#embedProviderCustomBtn').addEventListener('click', () => setProvider('embed', 'custom'));
  $('#embedProviderNvidiaBtn').addEventListener('click', () => setProvider('embed', 'nvidia'));

  $('#ollamaChatModel').addEventListener('change', e => {
    STATE.settings.ollamaChatModel = e.target.value;
    persist();
    updateStatusPill();
  });
  $('#ollamaEmbedModel').addEventListener('change', e => {
    STATE.settings.ollamaEmbedModel = e.target.value;
    persist();
  });
  $('#ollamaChatRefreshBtn').addEventListener('click', () => refreshOllamaModels('chat'));
  $('#ollamaEmbedRefreshBtn').addEventListener('click', () => refreshOllamaModels('embed'));

  $('#testKeyBtn').addEventListener('click', async () => {
    const result = $('#testKeyResult');
    result.style.color = '';
    if (isOllamaChat()) {
      result.textContent = 'Testing Ollama...';
      try {
        const res = await fetch(ollamaBaseUrl() + '/api/tags');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const names = (data.models || []).map(m => m.name);
        const hasModel = names.some(n => n === STATE.settings.ollamaChatModel || n.startsWith(STATE.settings.ollamaChatModel + ':'));
        result.style.color = hasModel ? '#1F6B2E' : '#B33';
        result.textContent = hasModel
          ? `Connected ✓ (${names.length} model${names.length === 1 ? '' : 's'} available)`
          : `Connected, but "${STATE.settings.ollamaChatModel}" isn't pulled yet — run: ollama pull ${STATE.settings.ollamaChatModel}`;
        updateStatusPill();
      } catch (e) {
        result.style.color = '#B33';
        result.textContent = 'Could not reach Ollama at ' + ollamaBaseUrl() + ': ' + e.message;
        console.error('Ollama test failed', e);
      }
      return;
    }
    if (isCustomApiChat()) {
      result.textContent = 'Testing...';
      try {
        if (!customApiBaseUrl()) throw new Error('Add a base URL first.');
        if (!STATE.settings.customApiKey) throw new Error('Add an API key first.');
        if (!activeModel()) throw new Error('Enter a model id first.');
        const res = await fetch(customApiBaseUrl() + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + STATE.settings.customApiKey },
          body: JSON.stringify({ model: activeModel(), messages: [{ role: 'user', content: 'Reply with just "ok".' }], max_tokens: 5 })
        });
        if (!res.ok) { const t = await res.text(); throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 200)); }
        result.style.color = '#1F6B2E';
        result.textContent = 'Connected ✓';
        updateStatusPill();
      } catch (e) {
        result.style.color = '#B33';
        result.textContent = 'Failed: ' + e.message;
        console.error('OmniRoute test failed', e);
      }
      return;
    }
    result.textContent = 'Testing...';
    try {
      const info = await testOpenRouterKey(STATE.settings.apiKey);
      const d = (info && info.data) || {};
      const remaining = d.limit_remaining != null ? ` — ${d.limit_remaining} credits left` : '';
      result.style.color = '#1F6B2E';
      result.textContent = 'Connected ✓' + remaining;
      updateStatusPill();
    } catch (e) {
      result.style.color = '#B33';
      result.textContent = 'Failed: ' + e.message;
      console.error('Test connection failed', e);
    }
  });
}

function setProvider(role, provider) {
  STATE.settings[role + 'Provider'] = provider;
  persist();
  applyProviderUI(role, provider);
  if (role === 'chat') updateStatusPill();
  if (provider === 'ollama') refreshOllamaModels(role);
}

function applyProviderUI(role, provider) {
  const orBtn = $('#' + role + 'ProviderOpenRouterBtn');
  const ollamaBtn = $('#' + role + 'ProviderOllamaBtn');
  const customBtn = $('#' + role + 'ProviderCustomBtn');
  const nvidiaBtn = $('#' + role + 'ProviderNvidiaBtn');
  const orFields = $('#' + role + 'OpenRouterFields');
  const ollamaFields = $('#' + role + 'OllamaFields');
  const customFields = $('#' + role + 'CustomFields');
  const nvidiaFields = $('#' + role + 'NvidiaFields');
  if (orBtn) orBtn.classList.toggle('active', provider === 'openrouter');
  if (ollamaBtn) ollamaBtn.classList.toggle('active', provider === 'ollama');
  if (customBtn) customBtn.classList.toggle('active', provider === 'custom');
  if (nvidiaBtn) nvidiaBtn.classList.toggle('active', provider === 'nvidia');
  if (orFields) orFields.style.display = provider === 'openrouter' ? 'block' : 'none';
  if (ollamaFields) ollamaFields.style.display = provider === 'ollama' ? 'block' : 'none';
  if (customFields) customFields.style.display = provider === 'custom' ? 'block' : 'none';
  if (nvidiaFields) nvidiaFields.style.display = provider === 'nvidia' ? 'block' : 'none';
  const ollamaCard = $('#ollamaServerCard');
  if (ollamaCard) ollamaCard.style.display = (isOllamaChat() || isOllamaEmbed()) ? 'block' : 'none';
  const customCard = $('#customApiServerCard');
  if (customCard) customCard.style.display = (isCustomApiChat() || isCustomApiEmbed()) ? 'block' : 'none';
  const nvidiaCard = $('#nvidiaServerCard');
  if (nvidiaCard) nvidiaCard.style.display = (isNvidiaChat() || isNvidiaEmbed()) ? 'block' : 'none';
}

// Fetches the list of locally-installed Ollama models (GET /api/tags) and
// fills the chat or embed dropdown with them. Keeps the currently saved
// model selected if it's still installed; otherwise falls back to the
// first one in the list and updates settings to match.
async function refreshOllamaModels(role) {
  const select = $('#ollama' + (role === 'chat' ? 'Chat' : 'Embed') + 'Model');
  const settingsKey = role === 'chat' ? 'ollamaChatModel' : 'ollamaEmbedModel';
  const refreshBtn = $('#ollama' + (role === 'chat' ? 'Chat' : 'Embed') + 'RefreshBtn');
  if (!select) return;
  if (refreshBtn) refreshBtn.disabled = true;
  select.innerHTML = '<option value="">Loading...</option>';
  try {
    const res = await fetch(ollamaBaseUrl() + '/api/tags');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const names = (data.models || []).map(m => m.name).sort();
    if (!names.length) {
      select.innerHTML = '<option value="">No models pulled yet — run: ollama pull ...</option>';
      return;
    }
    const current = STATE.settings[settingsKey];
    const keepCurrent = current && names.includes(current);
    select.innerHTML = names.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('');
    select.value = keepCurrent ? current : names[0];
    STATE.settings[settingsKey] = select.value;
    persist();
    if (role === 'chat') updateStatusPill();
  } catch (e) {
    console.error('Could not list Ollama models', e);
    select.innerHTML = `<option value="">Could not reach Ollama at ${escapeHtml(ollamaBaseUrl())}</option>`;
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function updateStatusPill() {
  const pill = $('#statusPill');
  if (isOllamaChat()) {
    pill.textContent = STATE.settings.ollamaChatModel ? 'Ollama: ' + STATE.settings.ollamaChatModel : 'Ollama model not set';
    pill.className = STATE.settings.ollamaChatModel ? 'status-pill status-on' : 'status-pill status-off';
  } else if (isCustomApiChat()) {
    const ready = chatReady();
    pill.textContent = ready ? 'OmniRoute: ' + activeModel() : 'OmniRoute not fully set up';
    pill.className = ready ? 'status-pill status-on' : 'status-pill status-off';
  } else if (isNvidiaChat()) {
    const ready = chatReady();
    pill.textContent = ready ? 'NVIDIA NIM: ' + activeModel() : 'NVIDIA NIM not fully set up';
    pill.className = ready ? 'status-pill status-on' : 'status-pill status-off';
  } else if (STATE.settings.apiKey) {
    pill.textContent = 'API key set';
    pill.className = 'status-pill status-on';
  } else {
    pill.textContent = 'API key not set';
    pill.className = 'status-pill status-off';
  }
}

/* ---------- Step 2: Document (upload, checklist, domain/tools) ---------- */
function wireDocumentStep() {
  $('#prelimText').value = STATE.prelimText;
  $('#prelimText').addEventListener('input', e => {
    STATE.prelimText = e.target.value;
    persist();
    updateSendToAiState();
    updateDocTypeUI();
  });

  $('#docTypeSelect').value = STATE.docType || 'preliminary';
  $('#docTypeSelect').addEventListener('change', e => {
    STATE.docType = e.target.value;
    if (!STATE.checklistReady) STATE.checklist = defaultChecklist(STATE.docType, STATE.templateId);
    persist();
    updateDocTypeUI();
    refreshCriteriaCounts();
    updateStepReadiness();
  });

  populateTemplateSelect();
  $('#templateSelect').addEventListener('change', e => {
    STATE.templateId = e.target.value;
    if (!STATE.checklistReady) STATE.checklist = defaultChecklist(STATE.docType, STATE.templateId);
    persist();
    refreshCriteriaCounts();
    updateStepReadiness();
  });

  const dz = $('#dropzone');
  const fileInput = $('#fileInput');
  dz.addEventListener('click', () => fileInput.click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  $('#resetDocBtn').addEventListener('click', resetDocument);
  wireQa();
  renderQaSections();
  wireChecklist();
  updateSendToAiState();
  if (STATE.checklistReady) { renderChecklist(); $('#checklistCard').style.display = 'block'; }
  wireDomainTools();
  renderDomainToolsList();
  $('#createDrdBtn').addEventListener('click', onCreateDrdClick);
  updateDocTypeUI();
}

// Fills the Document step's Template dropdown from Admin > Template Library
// and restores whichever category is currently selected in STATE (falling
// back to the first one if that id no longer exists, e.g. deleted in Admin).
function populateTemplateSelect() {
  const sel = $('#templateSelect');
  if (!sel) return;
  const list = (typeof MASTER_TEMPLATE_LIBRARY !== 'undefined') ? MASTER_TEMPLATE_LIBRARY : [];
  sel.innerHTML = list.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  const hasCurrent = list.some(t => t.id === STATE.templateId);
  if (!hasCurrent && list.length) STATE.templateId = list[0].id;
  sel.value = STATE.templateId || '';
}

// Both document types now go through the same Send to AI -> checklist ->
// agree/decline flow (checked against whichever Template Library
// category + doc-type section list is selected) before Team & Tools
// unlocks -- see checklistFullyResolved() and the Team & Tools rail-step
// gating in updateStepReadiness()/wireNav(). Domain/Tools picking still
// only applies to the Preliminary flow (direct DRD upload has no tool-fit
// step of its own), so that part alone stays doc-type specific below.
function updateDocTypeUI() {
  const isDrd = STATE.docType === 'requirement';
  if (isDrd) {
    // Direct DRD entry: the extracted/pasted text IS the DRD, no AI
    // generation step needed -- keep them in sync automatically.
    if (STATE.prelimText.trim() && STATE.drdText !== STATE.prelimText) {
      STATE.drdText = STATE.prelimText;
      persist();
    }
  } else {
    updateCreateDrdCardState();
  }
  renderDrdReviewSection();
}

// Preliminary flow only: the "Create Detailed Requirement Document" card
// appears once Send to AI has run (checklist + questions ready) --
// there's something meaningful to fold into a DRD by that point.
function updateCreateDrdCardState() {
  const card = $('#createDrdCard');
  if (!card) return;
  // Preliminary: available once the checklist has run (there's something
  // confirmed to fold in). Direct DRD upload: available as soon as there's
  // text, so it gets the same formatted-document treatment rather than
  // staying raw extracted text.
  const ready = STATE.docType === 'requirement'
    ? !!STATE.prelimText.trim()
    : STATE.checklistReady;
  card.style.display = ready ? 'block' : 'none';
}

function resetDocument() {
  const hasAnything = STATE.prelimText.trim() || STATE.drdText.trim() || STATE.proposal || STATE.sowHtml;
  if (!hasAnything) { showToast('Nothing to reset.'); return; }
  if (!window.confirm('Clear the uploaded/extracted document text, domain/tools, checklist, questions, the Detailed Requirement Document, Team & Tools selections, and any generated Proposal/Scope of Work? This resets Document, Team & Tools, and Review & Export back to a clean slate.')) return;
  const fresh = freshSessionState();
  STATE.prelimText = '';
  STATE.uploadedFileName = '';
  STATE.checklist = defaultChecklist(STATE.docType);
  refreshCriteriaCounts();
  STATE.checklistReady = false;
  STATE.aiSuggestions = [];
  STATE.toolFit = [];
  STATE.domainTools = [];
  STATE.qa = defaultQa();
  STATE.drdText = '';
  STATE.drd = null;
  STATE.drdHtml = '';
  STATE.solutions = [];
  STATE.proposal = null;
  STATE.editedHtml = null;
  STATE.sow = null;
  STATE.sowHtml = null;
  STATE.team = fresh.team;
  STATE.tools = fresh.tools;
  $('#prelimText').value = '';
  $('#parseStatus').textContent = '';
  $('#fileInput').value = '';
  $('#dropzoneLabel').textContent = 'Drop a .pdf or .docx here, or click to choose a file';
  $('#checklistCard').style.display = 'none';
  $('#aiVerifyStatus').textContent = '';
  renderDomainToolsList();
  renderQaSections();
  persist();
  updateSendToAiState();
  updateDocTypeUI();
  renderProposalPreview();
  renderSowPreview();
  populateMemberSelect(); populateToolSelects(); renderTeamTable(); renderToolTable(); renderCostingSummary();
  showToast('Document, Team & Tools, Detailed Requirement Document, and generated Proposal/SOW all cleared.');
}

async function handleFile(file) {
  const status = $('#parseStatus');
  status.textContent = 'Reading ' + file.name + '...';
  $('#dropzoneLabel').textContent = file.name;
  try {
    const text = await parseUploadedFile(file);
    STATE.prelimText = text;
    STATE.uploadedFileName = file.name;
    $('#prelimText').value = text;
    persist();
    if (STATE.docType === 'requirement') {
      status.textContent = `Extracted ${text.length.toLocaleString()} characters from ${file.name} and stored.`;
    } else {
      status.textContent = `Extracted ${text.length.toLocaleString()} characters from ${file.name} and stored. Pick a domain/tool below, then click "Send to AI".`;
    }
    updateSendToAiState();
    updateDocTypeUI();
  } catch (e) {
    status.textContent = 'Could not parse file: ' + e.message;
    showToast('Could not parse file: ' + e.message, true);
    console.error('Parse error', e);
  }
}

/* ---------- 15-item checklist (AI-driven: one "Send to AI" call both
   extracts what's already answered and flags what's missing, plus checks
   whether the selected domain/tool actually fits the document) ---------- */
function updateSendToAiState() {
  const btn = $('#sendToAiBtn');
  const hint = $('#sendToAiHint');
  if (!btn) return;
  const ready = !!STATE.prelimText.trim();
  btn.disabled = !ready;
  btn.classList.toggle('btn-ready', ready);
  if (!hint) return;
  hint.textContent = ready
    ? 'Ready — reads the document and checks it against every section of the selected template.'
    : 'Upload or paste a document above to enable this.';
}

function wireChecklist() {
  $('#sendToAiBtn').addEventListener('click', runSendToAi);
  $('#rescanBtn').addEventListener('click', runSendToAi);
}

/* Shared by every LLM call site below: turns a status element into a live
   "still working" indicator while a streamed response comes in. JSON-mode
   responses aren't meaningful to show raw mid-stream (half-formed curly
   braces), so this just shows a growing character count rather than the
   text itself -- still much better than a static, unmoving message. */
function makeStreamStatusUpdater(statusEl, prefix) {
  if (!statusEl) return null;
  return (delta, full) => {
    statusEl.textContent = `${prefix} ${full.length.toLocaleString()} characters generated so far...`;
  };
}

async function runSendToAi() {
  const status = $('#aiVerifyStatus');
  if (!chatReady()) { showToast('Set up a chat model (OpenRouter key, Ollama, or OmniRoute) in Setup first.', true); goToStep(1); return; }
  if (!STATE.prelimText.trim()) { showToast('Upload or paste a document first.', true); return; }
  const btn = $('#sendToAiBtn');
  const rescanBtn = $('#rescanBtn');
  if (btn) btn.disabled = true;
  if (rescanBtn) rescanBtn.disabled = true;
  status.textContent = `Reading the document and checking it against all ${STATE.checklist.length} criteria...`;
  try {
    const toolsWithDescriptions = STATE.domainTools.map(dt => ({
      domain: dt.domain,
      tool: dt.tool,
      description: combinedToolDescriptionText(dt.domain, dt.tool) || (zohoToolInfo(dt.domain, dt.tool) || {}).purpose || ''
    }));
    const toolsReferenceDoc = STATE.domainTools.length ? await kbFetchToolsReferenceDoc(STATE.domainTools) : null; // grounds tool-fit in any relevant uploaded Knowledge Base document(s), searched semantically per selected tool -- empty/no-op now that tool selection happens later via Solution Suggestions
    if (toolsReferenceDoc) status.textContent = `Reading the document, ${(toolsReferenceDoc.sources || []).join(', ')}, and checking against all ${STATE.checklist.length} criteria...`;
    const onDelta = makeStreamStatusUpdater(status, 'Analyzing —');
    const result = await analyzeDocumentChecklist(STATE.docType, STATE.prelimText, STATE.checklist, toolsWithDescriptions, toolsReferenceDoc, onDelta);
    const byId = {};
    (result.items || []).forEach(it => { byId[it.id] = it; });
    STATE.checklist.forEach(item => {
      const it = byId[item.id];
      if (it) {
        item.met = !!it.met;
        item.answer = it.met ? (it.answer || '').trim() : (item.answer || '');
        item.agreed = false; // fresh AI read -- always needs a human look before it counts as agreed
      }
    });
    STATE.aiSuggestions = result.suggestions || [];
    STATE.toolFit = result.toolFit || [];
    STATE.checklistReady = true;
    let generalQuestions = result.generalQuestions || [];
    let toolQuestions = result.toolQuestions || [];
    // The combined call asks the model to do five things at once -- every
    // so often it just under-delivers on one sub-task (most often the
    // tool-related questions, being last in the underlying reasoning even
    // though the JSON schema itself now lists them early). A single
    // lightweight backfill call is cheap insurance against silently
    // showing nothing rather than the person wondering if it's broken.
    if (toolQuestions.length < 3) {
      status.textContent = 'Drafting a few more tool-related questions...';
      try {
        const backfill = await generateIntakeQuestions();
        if ((backfill.toolQuestions || []).length > toolQuestions.length) {
          toolQuestions = backfill.toolQuestions;
        }
        if (!generalQuestions.length && (backfill.generalQuestions || []).length) {
          generalQuestions = backfill.generalQuestions;
        }
      } catch (e) {
        console.warn('Tool-questions backfill failed, keeping original result', e);
      }
    }
    STATE.qa = {
      general: generalQuestions.map(q => ({ q, a: '' })),
      tools: toolQuestions.map(q => ({ q, a: '' })),
      client: [],  // kept only so older saved pending sessions (pre-split) still load correctly
      company: []
    };
    persist();
    $('#checklistCard').style.display = 'block';
    checklistFilter = 'all';
    checklistEditingSet.clear();
    renderChecklist();
    renderAiSuggestions();
    renderQaSections();
    updateCreateDrdCardState();
    const metCount = STATE.checklist.filter(c => c.met).length;
    status.textContent = `Checklist ready — ${metCount} of ${STATE.checklist.length} criteria already met. Drafted ${STATE.qa.general.length} general + ${STATE.qa.tools.length} tool-related question(s) below.`;
    showToast('Checklist, tool fit, and missed questions all ready — one pass.');
  } catch (e) {
    status.textContent = 'Error: ' + e.message;
    showToast('Could not analyze the document: ' + e.message, true);
    console.error('Checklist analysis failed', e);
  } finally {
    if (btn) btn.disabled = false;
    if (rescanBtn) rescanBtn.disabled = false;
  }
}

let checklistFilter = 'all'; // 'all' | 'met' | 'unmet'
let checklistEditingSet = new Set(); // transient UI state: indices of met items currently unlocked for editing

function renderChecklist() {
  const wrap = $('#checklistList');
  if (!wrap) return;
  const metCount = STATE.checklist.filter(c => c.met).length;
  const unmetCount = STATE.checklist.length - metCount;
  $('#checklistProgress').innerHTML = `
    <div class="chk-filters">
      <button class="chk-filter-btn ${checklistFilter === 'all' ? 'active' : ''}" data-filter="all">All (${STATE.checklist.length})</button>
      <button class="chk-filter-btn ${checklistFilter === 'met' ? 'active' : ''}" data-filter="met">Criteria met (${metCount})</button>
      <button class="chk-filter-btn ${checklistFilter === 'unmet' ? 'active' : ''}" data-filter="unmet">Criteria not met (${unmetCount})</button>
    </div>
    <div>${metCount} of ${STATE.checklist.length} criteria met.</div>
  `;
  $('#checklistProgress').querySelectorAll('.chk-filter-btn').forEach(b => b.addEventListener('click', () => {
    checklistFilter = b.dataset.filter;
    renderChecklist();
  }));

  const visible = STATE.checklist
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => checklistFilter === 'all' || (checklistFilter === 'met' && item.met) || (checklistFilter === 'unmet' && !item.met));

  wrap.innerHTML = visible.map(({ item, i }) => {
    // Not-yet-met items are always editable (nothing to protect yet). Met
    // items are read-only until "Edit" is explicitly clicked -- avoids
    // accidentally overwriting the AI's answer just by clicking into it.
    const editing = checklistEditingSet.has(i);
    const showTextarea = !item.met || editing;
    const bodyHtml = showTextarea
      ? `<textarea rows="2" class="chk-answer" data-idx="${i}" placeholder="Not found in the document — type an answer, then click Agree">${escapeHtml(item.answer || '')}</textarea>`
      : `<div class="chk-answer-view" data-idx="${i}">${escapeHtml(item.answer || '') || '<span class="hint" style="margin:0">(blank)</span>'}</div>`;

    let actionsHtml;
    if (!item.met) {
      actionsHtml = `<button class="btn primary small chk-agree" data-idx="${i}">Agree</button><button class="btn secondary small chk-decline" data-idx="${i}">Decline (N/A)</button>`;
    } else if (editing) {
      actionsHtml = `<button class="btn primary small chk-agree" data-idx="${i}">Agree</button><button class="btn secondary small chk-done" data-idx="${i}">Done</button>`;
    } else if (item.agreed) {
      actionsHtml = `<button class="btn secondary small chk-edit" data-idx="${i}">Edit</button>`;
    } else {
      actionsHtml = `<button class="btn primary small chk-agree" data-idx="${i}">Agree</button><button class="btn secondary small chk-edit" data-idx="${i}">Edit</button>`;
    }

    return `
    <div class="checklist-item ${item.met ? (item.declined ? 'chk-grey' : 'chk-green') : 'chk-red'}">
      <div class="checklist-item-head">
        <span class="checklist-purpose">${i + 1}. ${escapeHtml(item.purpose)}</span>
        ${item.declined
          ? '<span class="checklist-badge badge-declined">Declined — N/A</span>'
          : item.met
            ? (item.agreed ? '<span class="chk-agreed-tag">Agreed ✓</span>' : `<span class="checklist-badge badge-found">Criteria met</span>`)
            : `<span class="checklist-badge badge-blank">Not met — fill in</span>`}
      </div>
      <div class="checklist-q">${escapeHtml(item.question)}</div>
      ${bodyHtml}
      <div class="checklist-actions">${actionsHtml}</div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.chk-answer').forEach(el => el.addEventListener('input', onChecklistAnswerInput));
  wrap.querySelectorAll('.chk-agree').forEach(el => el.addEventListener('click', onChecklistAgree));
  wrap.querySelectorAll('.chk-edit').forEach(el => el.addEventListener('click', onChecklistEditToggle));
  wrap.querySelectorAll('.chk-done').forEach(el => el.addEventListener('click', onChecklistDone));
  wrap.querySelectorAll('.chk-decline').forEach(el => el.addEventListener('click', onChecklistDecline));
  updateTeamToolsGateUi();
}

function onChecklistDecline(e) {
  const idx = Number(e.target.dataset.idx);
  const item = STATE.checklist[idx];
  if (!item) return;
  item.declined = true;
  item.met = true;
  item.agreed = true;
  if (!item.answer || !item.answer.trim()) item.answer = 'Not applicable to this engagement.';
  persist();
  renderChecklist();
}

function onChecklistAnswerInput(e) {
  const idx = Number(e.target.dataset.idx);
  const item = STATE.checklist[idx];
  if (!item) return;
  item.answer = e.target.value;
  // Editing an already-agreed answer un-agrees it (without clearing text) so
  // it gets a fresh look -- typing into a not-yet-met item doesn't auto-agree.
  if (item.met && item.agreed) item.agreed = false;
  if (item.declined) item.declined = false;
  persist();
}

function onChecklistAgree(e) {
  const idx = Number(e.target.dataset.idx);
  const item = STATE.checklist[idx];
  if (!item) return;
  if (!item.answer || !item.answer.trim()) { showToast('Type an answer before agreeing.', true); return; }
  item.met = true;
  item.agreed = true;
  checklistEditingSet.delete(idx);
  persist();
  renderChecklist();
}

// Unlocks a met item for editing (read-only view -> textarea). Non-destructive.
function onChecklistEditToggle(e) {
  const idx = Number(e.target.dataset.idx);
  checklistEditingSet.add(idx);
  renderChecklist();
  const ta = $(`.chk-answer[data-idx="${idx}"]`);
  if (ta) ta.focus();
}

// Exits edit mode without necessarily agreeing (e.g. just fixing a typo).
function onChecklistDone(e) {
  const idx = Number(e.target.dataset.idx);
  checklistEditingSet.delete(idx);
  renderChecklist();
}

// Called right before generating: silently agrees any met-but-unagreed item
// so a forgotten click doesn't block generation, per spec.
function autoAgreeChecklist() {
  let changed = false;
  STATE.checklist.forEach(item => {
    if (item.met && !item.agreed) { item.agreed = true; changed = true; }
  });
  if (changed) {
    checklistEditingSet.clear();
    persist();
    if ($('#checklistCard')) renderChecklist();
  }
}

function renderAiSuggestions() {
  const el = $('#aiSuggestions');
  if (!el) return;
  const suggestionsHtml = (STATE.aiSuggestions || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');
  const toolsHtml = (STATE.toolFit || []).map(t => {
    const fits = t.verdict === 'fits';
    return `<li class="${fits ? '' : 'warn'}"><span class="tool-fit-badge ${fits ? 'fit-yes' : 'fit-no'}">${fits ? 'Fits' : 'Differs'}</span> ${escapeHtml(t.tool)}: ${escapeHtml(t.comment || '')}</li>`;
  }).join('');
  el.innerHTML = `
    ${toolsHtml ? `<h3 style="font-size:13px;color:var(--green-dark);margin:14px 0 6px">Tool fit</h3><ul class="checklist">${toolsHtml}</ul>` : ''}
    ${suggestionsHtml ? `<h3 style="font-size:13px;color:var(--green-dark);margin:14px 0 6px">Suggestions</h3><ul class="checklist">${suggestionsHtml}</ul>` : ''}
  `;
}

/* ---------- Domain / tool reference (from zoho-comprehensive-toolkit.json) ---------- */
// Domains/tools for the Document step's dropdowns now come straight from
// the priced master list (Knowledge Base > "Zoho tools & editions"), not
// the fixed ZOHO_TOOLKIT reference data -- so adding/editing a tool there
// (including its Domain) shows up here immediately, with no separate sync
// step. ZOHO_TOOLKIT is still used for rich AI-facing descriptions when a
// name matches it (zohoToolInfo, prefix-tolerant of the "Zoho " master
// list naming) -- that part is unaffected.
function masterToolDomains() {
  return Array.from(new Set(MASTER_TOOLS.map(t => t.domain).filter(Boolean))).sort();
}
function masterToolsInDomain(domain) {
  return Array.from(new Set(MASTER_TOOLS.filter(t => t.domain === domain).map(t => t.tool))).sort();
}

function populateDomainSelect() {
  const sel = $('#domainSelect');
  if (!sel) return;
  const domains = masterToolDomains();
  if (!domains.length) {
    sel.innerHTML = '<option value="">No domains yet -- add tools in Knowledge Base</option>';
    sel.disabled = true;
  } else {
    sel.disabled = false;
    sel.innerHTML = domains.map(d => `<option value="${escapeAttr(d)}">${escapeHtml(formatDomainLabel(d))}</option>`).join('');
  }
  populateDomainToolSelect();
}
function populateDomainToolSelect() {
  const selDomain = $('#domainSelect');
  const sel = $('#domainToolSelect');
  if (!selDomain || !sel) return;
  const domain = selDomain.value;
  const alreadyAdded = new Set(STATE.domainTools.filter(dt => dt.domain === domain).map(dt => dt.tool));
  const tools = masterToolsInDomain(domain).filter(t => !alreadyAdded.has(t));
  if (!tools.length) {
    sel.innerHTML = '<option value="">All tools added</option>';
    sel.disabled = true;
    $('#addDomainToolBtn').disabled = true;
    return;
  }
  sel.disabled = false;
  $('#addDomainToolBtn').disabled = false;
  sel.innerHTML = tools.map(t => `<option value="${escapeAttr(t)}">${escapeHtml(t.replace(/_/g, ' '))}</option>`).join('');
}

function renderDomainToolsList() {
  const wrap = $('#domainToolsList');
  if (!wrap) return;
  $('#domainToolsEmptyHint').style.display = STATE.domainTools.length ? 'none' : 'block';
  wrap.innerHTML = STATE.domainTools.map((dt, i) => {
    const info = zohoToolInfo(dt.domain, dt.tool);
    const matched = findMasterToolMatch(dt.tool);
    return `
      <div class="domain-tool-chip">
        <div>
          <b>${escapeHtml(dt.tool.replace(/_/g, ' '))}</b>
          <span class="hint" style="margin:0">— ${escapeHtml(dt.domain.replace(/_/g, ' '))}${matched ? ' · pre-added in Team & Tools' : ''}</span>
          ${info ? `<div class="hint" style="margin:2px 0 0">${escapeHtml(info.purpose)}</div>` : ''}
        </div>
        <button class="row-remove" data-idx="${i}">✕</button>
      </div>`;
  }).join('');
  wrap.querySelectorAll('button').forEach(b => b.addEventListener('click', e => {
    const idx = Number(e.target.dataset.idx);
    STATE.domainTools.splice(idx, 1);
    persist();
    renderDomainToolsList();
    populateDomainToolSelect();
    updateSendToAiState();
  }));
}

function wireDomainTools() {
  const domainSelect = $('#domainSelect');
  const addBtn = $('#addDomainToolBtn');
  if (!domainSelect || !addBtn) return; // Domain/Tool reference UI was removed from the Document step -- tool selection now happens later via Solution Suggestions / Team & Tools
  populateDomainSelect();
  domainSelect.addEventListener('change', populateDomainToolSelect);
  addBtn.addEventListener('click', () => {
    const domain = $('#domainSelect').value;
    const tool = $('#domainToolSelect').value;
    if (!domain || !tool) return;
    STATE.domainTools.push({ domain, tool });
    // Pre-add any name-matching priced tool into Team & Tools right away --
    // never touches pricing/editions, just flips its "included" flag.
    const rec = findMasterToolMatch(tool);
    if (rec && !rec.included) {
      rec.included = true;
      showToast(`Added. A matching tool (${rec.tool}) was pre-added in Team & Tools.`);
    }
    persist();
    renderDomainToolsList();
    populateDomainToolSelect();
    updateSendToAiState();
  });
}

/* ---------- Q&A gap-filling ---------- */
const QA_BUCKET_DEFS = [
  { key: 'general', listId: 'qaGeneralList' },
  { key: 'tools', listId: 'qaToolsList' },
  { key: 'company', listId: 'companyQuestionsList', sectionId: 'companyQuestionsSection' }, // legacy
  { key: 'client', listId: 'clientQuestionsList', sectionId: 'clientQuestionsSection' }      // legacy
];

function renderQaSections() {
  const wrap = $('#qaSections');
  if (!wrap) return;
  const anyContent = QA_BUCKET_DEFS.some(b => STATE.qa[b.key] && STATE.qa[b.key].length);
  wrap.style.display = anyContent ? 'block' : 'none';
  if (!anyContent) return;
  QA_BUCKET_DEFS.forEach(b => {
    const items = STATE.qa[b.key] || [];
    const listEl = $('#' + b.listId);
    if (listEl) listEl.innerHTML = items.map((item, i) => qaItemHtml(b.key, i, item)).join('');
    if (b.sectionId) { // legacy buckets: only show the section header at all if it has content
      const sectionEl = $('#' + b.sectionId);
      if (sectionEl) sectionEl.style.display = items.length ? 'block' : 'none';
    }
  });
  $all(QA_BUCKET_DEFS.map(b => '#' + b.listId + ' textarea').join(', ')).forEach(t => t.addEventListener('input', onQaAnswerChange));
}

function qaItemHtml(type, i, item) {
  return `<label class="field"><span>${escapeHtml(item.q)}</span><textarea rows="2" data-qtype="${type}" data-idx="${i}" placeholder="Your answer...">${escapeHtml(item.a || '')}</textarea></label>`;
}

function onQaAnswerChange(e) {
  const type = e.target.dataset.qtype;
  const idx = Number(e.target.dataset.idx);
  if (STATE.qa[type] && STATE.qa[type][idx]) {
    STATE.qa[type][idx].a = e.target.value;
    persist();
  }
}

async function runGenerateQuestions() {
  const btn = $('#genQuestionsBtn');
  const status = $('#qaStatus');
  if (!chatReady()) { showToast('Set up a chat model (OpenRouter key, Ollama, or OmniRoute) in Setup first.', true); goToStep(1); return; }
  if (!STATE.prelimText.trim()) { showToast('Upload or paste a preliminary document first.', true); return; }
  btn.disabled = true;
  status.textContent = 'Reading the document and drafting questions...';
  try {
    const result = await generateIntakeQuestions(makeStreamStatusUpdater(status, 'Drafting questions —'));
    STATE.qa = {
      general: (result.generalQuestions || []).map(q => ({ q, a: '' })),
      tools: (result.toolQuestions || []).map(q => ({ q, a: '' })),
      client: [],  // kept only so older saved pending sessions (pre-split) still load correctly
      company: []
    };
    persist();
    renderQaSections();
    const total = STATE.qa.general.length + STATE.qa.tools.length;
    status.textContent = `Generated ${STATE.qa.general.length} general question(s) and ${STATE.qa.tools.length} tool-related question(s).`;
    showToast('Questions ready.');
  } catch (e) {
    status.textContent = 'Error: ' + e.message;
    showToast('Could not generate questions: ' + e.message, true);
    console.error('Question generation failed', e);
  } finally {
    btn.disabled = false;
  }
}

function acceptAllQa() {
  const answeredByBucket = {};
  let anyAnswered = false;
  QA_BUCKET_DEFS.forEach(b => {
    const answered = (STATE.qa[b.key] || []).filter(x => x.a && x.a.trim());
    answeredByBucket[b.key] = answered;
    if (answered.length) anyAnswered = true;
  });
  if (!anyAnswered) { showToast('Answer at least one question first.', true); return; }

  const bucketTitles = { general: 'Additional Information', tools: 'Additional Tool / Systems Information', client: 'Additional Client Information', company: 'Additional Company / Engagement Information' };
  let block = '';
  QA_BUCKET_DEFS.forEach(b => {
    const answered = answeredByBucket[b.key];
    if (!answered.length) return;
    block += `\n\n--- ${bucketTitles[b.key] || b.key} ---\n`;
    answered.forEach(x => { block += `Q: ${x.q}\nA: ${x.a.trim()}\n\n`; });
  });

  STATE.prelimText = (STATE.prelimText || '').trim() + block;
  // Only the answered questions get folded in and cleared; unanswered ones stay for later.
  QA_BUCKET_DEFS.forEach(b => {
    STATE.qa[b.key] = (STATE.qa[b.key] || []).filter(x => !(x.a && x.a.trim()));
  });
  persist();

  const prelimEl = $('#prelimText');
  if (prelimEl) prelimEl.value = STATE.prelimText;
  renderQaSections();
  showToast('Answers added to the document.');
}

function saveForLater() {
  const hasQa = QA_BUCKET_DEFS.some(b => (STATE.qa[b.key] || []).length);
  const hasContent = STATE.prelimText.trim() || STATE.drdText.trim() || STATE.proposal || STATE.sowHtml;
  if (!hasContent && !hasQa) { showToast('Nothing to save yet.', true); return; }

  const patch = {
    savedAt: new Date().toISOString(),
    label: STATE.uploadedFileName || STATE.client.clientCompany || STATE.client.clientContact || 'Untitled document',
    client: STATE.client,
    docType: STATE.docType,
    templateId: STATE.templateId,
    prelimText: STATE.prelimText,
    uploadedFileName: STATE.uploadedFileName,
    checklist: STATE.checklist,
    checklistReady: STATE.checklistReady,
    domainTools: STATE.domainTools,
    toolFit: STATE.toolFit,
    qa: STATE.qa,
    drdText: STATE.drdText,
    drd: STATE.drd,
    drdHtml: STATE.drdHtml,
    solutions: STATE.solutions,
    proposal: STATE.proposal,
    editedHtml: STATE.editedHtml,
    sow: STATE.sow,
    sowHtml: STATE.sowHtml
  };

  if (STATE.pendingId && updatePendingSession(STATE.pendingId, patch)) {
    showToast('Updated the same pending draft. Starting a new session — find it any time in Pending.');
  } else {
    addPendingSession(Object.assign({ id: 'pending-' + Date.now() }, patch));
    showToast('Saved for later. Starting a new session — find it any time in Pending.');
  }
  updatePendingBadge(loadPendingSessions().length);

  try {
    resetSessionFields();
  } catch (e) {
    console.error('Reset failed', e);
    showToast('Reset ran into an error (see console) — navigating anyway.', true);
  }
  goToStep(2);
}

function wireQa() {
  $('#genQuestionsBtn').addEventListener('click', runGenerateQuestions);
  $('#acceptQaBtn').addEventListener('click', acceptAllQa);
  $('#saveForLaterBtn').addEventListener('click', saveForLater);
}

/* ---------- Pending (saved-for-later) ---------- */
function updatePendingBadge(count) {
  const badge = $('#pendingBadge');
  if (!badge) return;
  if (count > 0) { badge.textContent = String(count); badge.style.display = 'inline-block'; }
  else badge.style.display = 'none';
}

function renderPendingList() {
  const list = loadPendingSessions();
  const wrap = $('#pendingList');
  const emptyHint = $('#pendingEmptyHint');
  updatePendingBadge(list.length);
  if (!list.length) {
    wrap.innerHTML = '';
    emptyHint.style.display = 'block';
    emptyHint.textContent = 'Nothing saved for later. Use "Save for later" in the Document step\'s question list to put a draft here.';
    return;
  }

  const q = ($('#pendingSearch').value || '').trim().toLowerCase();
  const fromVal = $('#pendingFilterFrom').value; // yyyy-mm-dd or ''
  const toVal = $('#pendingFilterTo').value;
  const fromTime = fromVal ? new Date(fromVal + 'T00:00:00').getTime() : null;
  const toTime = toVal ? new Date(toVal + 'T23:59:59').getTime() : null;

  const filtered = list.filter(rec => {
    if (q) {
      const haystack = ((rec.label || '') + ' ' + (rec.uploadedFileName || '') + ' ' + (rec.client?.clientCompany || '')).toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    const savedTime = new Date(rec.savedAt).getTime();
    if (fromTime != null && savedTime < fromTime) return false;
    if (toTime != null && savedTime > toTime) return false;
    return true;
  });

  if (!filtered.length) {
    wrap.innerHTML = '';
    emptyHint.style.display = 'block';
    emptyHint.textContent = 'No pending drafts match your search/filter.';
    return;
  }
  emptyHint.style.display = 'none';

  wrap.innerHTML = filtered.map(rec => {
    const qa = rec.qa || {};
    const answered = QA_BUCKET_DEFS.reduce((sum, b) => sum + (qa[b.key] || []).filter(x => x.a && x.a.trim()).length, 0);
    const total = QA_BUCKET_DEFS.reduce((sum, b) => sum + (qa[b.key] || []).length, 0);
    const snippet = (rec.prelimText || '').slice(0, 160);
    const badges = [
      rec.docType === 'requirement' ? 'DRD' : 'Preliminary',
      (rec.docType === 'preliminary' && rec.drdText) ? 'DRD created' : null,
      rec.proposal || rec.editedHtml ? 'Proposal generated' : null,
      rec.sowHtml ? 'Scope of Work generated' : null
    ].filter(Boolean);
    return `
      <div class="card">
        <div class="card-head-row">
          <h2>${escapeHtml(rec.label || 'Untitled document')}</h2>
          <span class="hint" style="margin:0">${new Date(rec.savedAt).toLocaleString()}</span>
        </div>
        <p class="hint">${badges.join(' · ')}${total ? ` · ${answered}/${total} questions answered` : ''}</p>
        <p style="font-size:13px;color:var(--ink-soft);margin:0 0 12px">${escapeHtml(snippet)}${(rec.prelimText || '').length > 160 ? '…' : ''}</p>
        <div class="add-row" style="margin-bottom:0">
          <button class="btn primary small" data-act="resume" data-id="${rec.id}">Resume</button>
          <button class="btn secondary small" data-act="delete" data-id="${rec.id}">Delete</button>
        </div>
      </div>`;
  }).join('');
  wrap.querySelectorAll('button').forEach(b => b.addEventListener('click', onPendingAction));
}

function wirePendingFilters() {
  const searchEl = $('#pendingSearch');
  const fromEl = $('#pendingFilterFrom');
  const toEl = $('#pendingFilterTo');
  const clearBtn = $('#pendingFilterClearBtn');
  if (!searchEl) return;
  [searchEl, fromEl, toEl].forEach(el => el.addEventListener('input', renderPendingList));
  clearBtn.addEventListener('click', () => {
    searchEl.value = '';
    fromEl.value = '';
    toEl.value = '';
    renderPendingList();
  });
}

function onPendingAction(e) {
  const id = e.target.dataset.id;
  const act = e.target.dataset.act;
  if (act === 'resume') resumePendingSession(id);
  else if (act === 'delete') {
    if (!window.confirm('Delete this pending draft permanently? This cannot be undone.')) return;
    deletePendingSession(id);
    renderPendingList();
    showToast('Pending draft deleted.');
  }
}

function resumePendingSession(id) {
  const rec = loadPendingSessions().find(r => r.id === id);
  if (!rec) return;
  const fresh = freshSessionState();
  STATE.client = Object.assign(fresh.client, rec.client || {});
  STATE.docType = rec.docType || fresh.docType;
  STATE.templateId = rec.templateId || fresh.templateId;
  STATE.prelimText = rec.prelimText || '';
  STATE.uploadedFileName = rec.uploadedFileName || '';
  STATE.checklist = (rec.checklist && rec.checklist.length) ? rec.checklist : fresh.checklist;
  STATE.checklistReady = !!rec.checklistReady;
  STATE.domainTools = rec.domainTools || fresh.domainTools;
  STATE.aiSuggestions = [];
  STATE.toolFit = rec.toolFit || [];
  STATE.qa = rec.qa || fresh.qa;
  STATE.drdText = rec.drdText || '';
  STATE.drd = rec.drd || null;
  STATE.drdHtml = rec.drdHtml || '';
  STATE.solutions = rec.solutions || [];
  STATE.team = fresh.team;
  STATE.tools = fresh.tools;
  STATE.proposal = rec.proposal || null;
  STATE.editedHtml = rec.editedHtml || null;
  STATE.sow = rec.sow || null;
  STATE.sowHtml = rec.sowHtml || null;
  STATE.pendingId = id;
  persist();

  const prelimEl = $('#prelimText');
  if (prelimEl) prelimEl.value = STATE.prelimText;
  const docTypeEl = $('#docTypeSelect');
  if (docTypeEl) docTypeEl.value = STATE.docType;
  populateTemplateSelect();
  updateDocTypeUI();
  renderQaSections();
  renderDomainToolsList();
  checklistFilter = 'all';
  checklistEditingSet.clear();
  updateSendToAiState();
  const checklistCardEl = $('#checklistCard');
  if (STATE.checklistReady) {
    renderChecklist();
    if (checklistCardEl) checklistCardEl.style.display = 'block';
  } else if (checklistCardEl) {
    checklistCardEl.style.display = 'none';
  }
  showToast('Resumed — pick up where you left off. (This draft stays in Pending until you delete it.)');
  goToStep(2);
}

/* ---------- Admin (master data + edit history) ---------- */
function roleOptionsHtml(selected) {
  const roles = allRoleOptions();
  const list = (selected && !roles.includes(selected)) ? [selected, ...roles] : roles;
  return list.map(r => `<option value="${escapeAttr(r)}" ${r === selected ? 'selected' : ''}>${escapeHtml(r)}${(selected === r && !roles.includes(r)) ? ' (removed)' : ''}</option>`).join('');
}

function populateAdminRoleSelect() {
  const sel = $('#adminNewMemberRole');
  if (!sel) return;
  sel.innerHTML = '<option value="">No role</option>' +
    allRoleOptions().map(r => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('');
}

let adminTeamDrafts = {};
let adminToolsDrafts = {};

function renderAdminTeamTable() {
  const body = $('#adminTeamTableBody');
  const searchEl = $('#adminTeamSearch');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const rows = MASTER_TEAM.filter(m => !q || (m.name || '').toLowerCase().includes(q) || (m.role || '').toLowerCase().includes(q));
  body.innerHTML = rows.map(m => {
    const draft = adminTeamDrafts[m.id] || {};
    const nameVal = draft.name !== undefined ? draft.name : m.name;
    const rateVal = draft.costPerHour !== undefined ? draft.costPerHour : m.costPerHour;
    const roleVal = draft.role !== undefined ? draft.role : (m.role || '');
    const fixed = FIXED_ROLE_BY_NAME[m.name];
    const roleCell = fixed
      ? `<span title="Fixed role">${escapeHtml(fixed)}</span>`
      : `<select data-act="role" data-id="${m.id}"><option value="">No role</option>${roleOptionsHtml(roleVal)}</select>`;
    const dirty = Object.keys(draft).length > 0;
    return `<tr data-drag-id="${m.id}">
      <td class="drag-handle" title="Drag to reorder">⠿</td>
      <td><input type="text" value="${escapeAttr(nameVal)}" data-act="name" data-id="${m.id}"></td>
      <td><input type="number" value="${rateVal}" data-act="costPerHour" data-id="${m.id}"></td>
      <td>${roleCell}</td>
      <td class="row-actions-cell">
        <span class="row-actions team-actions" data-id="${m.id}" style="display:${dirty ? 'inline-flex' : 'none'}">
          <button class="row-accept" data-act="accept" data-id="${m.id}" title="Accept this change">✓</button>
          <button class="row-decline" data-act="decline" data-id="${m.id}" title="Discard this change">⟲</button>
        </span>
        <button class="row-remove" data-act="delete" data-id="${m.id}" title="Delete member">✕</button>
      </td>
    </tr>`;
  }).join('');
  body.querySelectorAll('input[data-act], select[data-act]').forEach(el => {
    el.addEventListener('input', onAdminTeamFieldInput);
    el.addEventListener('change', onAdminTeamFieldInput);
  });
  body.querySelectorAll('button[data-act]').forEach(el => el.addEventListener('click', onAdminTeamButtonClick));
  wireRowDrag(body, 'team');
}

// Generic native-HTML5-drag-and-drop wiring for admin table rows. Only the
// ⠿ handle cell is draggable, so dragging a row never fights with selecting
// text inside its input fields.
function wireRowDrag(tbody, kind) {
  let draggedId = null;
  tbody.querySelectorAll('tr[data-drag-id]').forEach(row => {
    const handle = row.querySelector('.drag-handle');
    if (handle) {
      handle.setAttribute('draggable', 'true');
      handle.addEventListener('dragstart', e => {
        draggedId = row.dataset.dragId;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      handle.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
      });
    }
    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (row.dataset.dragId !== draggedId) row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const targetId = row.dataset.dragId;
      if (!draggedId || draggedId === targetId) return;
      if (kind === 'team') { reorderMasterTeam(draggedId, targetId); renderAdminTeamTable(); }
      else if (kind === 'criteria') { reorderMasterCriteria(draggedId, targetId); renderAdminCriteriaTable(); }
      else { reorderMasterTools(draggedId, targetId); renderAdminToolsTable(); }
    });
  });
}

function onAdminTeamFieldInput(e) {
  const el = e.target;
  const id = el.dataset.id;
  const field = el.dataset.act;
  const rec = MASTER_TEAM.find(m => m.id === id);
  if (!rec) return;
  const newVal = el.value;
  const origVal = String(rec[field] == null ? '' : rec[field]);
  if (!adminTeamDrafts[id]) adminTeamDrafts[id] = {};
  if (String(newVal) === origVal) delete adminTeamDrafts[id][field];
  else adminTeamDrafts[id][field] = newVal;
  if (Object.keys(adminTeamDrafts[id]).length === 0) delete adminTeamDrafts[id];
  const cell = document.querySelector(`.team-actions[data-id="${id}"]`);
  if (cell) cell.style.display = adminTeamDrafts[id] ? 'inline-flex' : 'none';
}

function onAdminTeamButtonClick(e) {
  const id = e.target.dataset.id;
  const act = e.target.dataset.act;
  if (act === 'delete') {
    if (!window.confirm('Remove this team member from the master list? Proposals already generated are unaffected.')) return;
    delete adminTeamDrafts[id];
    deleteMasterTeamMember(id);
    renderAdminTeamTable();
    renderTeamHistory();
  } else if (act === 'accept') {
    const draft = adminTeamDrafts[id];
    if (!draft) return;
    Object.entries(draft).forEach(([field, value]) => updateMasterTeamField(id, field, value));
    delete adminTeamDrafts[id];
    renderAdminTeamTable();
    renderTeamHistory();
    showToast('Change accepted.');
  } else if (act === 'decline') {
    delete adminTeamDrafts[id];
    renderAdminTeamTable();
    showToast('Change discarded.');
  }
}

function onAdminAddMember() {
  const name = $('#adminNewMemberName').value.trim();
  const rate = $('#adminNewMemberRate').value;
  const role = $('#adminNewMemberRole').value;
  if (!name) { showToast('Enter a name first.', true); return; }
  addMasterTeamMember(name, rate, role);
  $('#adminNewMemberName').value = '';
  $('#adminNewMemberRate').value = '';
  $('#adminNewMemberRole').value = '';
  renderAdminTeamTable();
  renderTeamHistory();
  showToast('Team member added.');
}

function formatDomainLabel(domain) {
  return (domain || '').replace(/_/g, ' ');
}

function domainOptionsHtml(selected) {
  const domains = (typeof allDomainNames === 'function') ? allDomainNames() : [];
  const list = (selected && !domains.includes(selected)) ? [selected, ...domains] : domains; // a domain removed from the list but still referenced by a record shouldn't just disappear from view
  const opts = ['<option value="">— none —</option>']
    .concat(list.map(d => `<option value="${escapeAttr(d)}" ${d === selected ? 'selected' : ''}>${escapeHtml(formatDomainLabel(d))}${(selected === d && !domains.includes(d)) ? ' (removed)' : ''}</option>`));
  return opts.join('');
}

function renderAdminToolsTable() {
  const body = $('#adminToolsTableBody');
  const searchEl = $('#adminToolsSearch');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const rows = MASTER_TOOLS.filter(t => !q
    || (t.tool || '').toLowerCase().includes(q)
    || (t.edition || '').toLowerCase().includes(q)
    || (t.notes || '').toLowerCase().includes(q)
    || formatDomainLabel(t.domain).toLowerCase().includes(q));
  body.innerHTML = rows.map(t => {
    const draft = adminToolsDrafts[t.id] || {};
    const toolVal = draft.tool !== undefined ? draft.tool : t.tool;
    const domainVal = draft.domain !== undefined ? draft.domain : (t.domain || '');
    const editionVal = draft.edition !== undefined ? draft.edition : t.edition;
    const monthlyVal = draft.monthly !== undefined ? draft.monthly : (t.monthly == null ? '' : t.monthly);
    const yearlyVal = draft.yearly !== undefined ? draft.yearly : (t.yearly == null ? '' : t.yearly);
    const notesVal = draft.notes !== undefined ? draft.notes : (t.notes || '');
    const dirty = Object.keys(draft).length > 0;
    return `<tr data-drag-id="${t.id}">
      <td class="drag-handle" title="Drag to reorder">⠿</td>
      <td><select data-act="domain" data-id="${t.id}">${domainOptionsHtml(domainVal)}</select></td>
      <td><input type="text" value="${escapeAttr(toolVal)}" data-act="tool" data-id="${t.id}"></td>
      <td><input type="text" value="${escapeAttr(editionVal)}" data-act="edition" data-id="${t.id}"></td>
      <td><input type="number" value="${monthlyVal}" data-act="monthly" data-id="${t.id}"></td>
      <td><input type="number" value="${yearlyVal}" data-act="yearly" data-id="${t.id}"></td>
      <td><input type="text" value="${escapeAttr(notesVal)}" data-act="notes" data-id="${t.id}"></td>
      <td class="row-actions-cell">
        <span class="row-actions tools-actions" data-id="${t.id}" style="display:${dirty ? 'inline-flex' : 'none'}">
          <button class="row-accept" data-act="accept" data-id="${t.id}" title="Accept this change">✓</button>
          <button class="row-decline" data-act="decline" data-id="${t.id}" title="Discard this change">⟲</button>
        </span>
        <button class="row-remove" data-act="delete" data-id="${t.id}" title="Delete tool">✕</button>
      </td>
    </tr>`;
  }).join('');
  body.querySelectorAll('input[data-act], select[data-act]').forEach(el => {
    el.addEventListener('input', onAdminToolFieldInput);
    el.addEventListener('change', onAdminToolFieldInput);
  });
  body.querySelectorAll('button[data-act]').forEach(el => el.addEventListener('click', onAdminToolButtonClick));
  wireRowDrag(body, 'tools');
  refreshAdminToolDatalists();
}

function onAdminToolFieldInput(e) {
  const el = e.target;
  const id = el.dataset.id;
  const field = el.dataset.act;
  const rec = MASTER_TOOLS.find(t => t.id === id);
  if (!rec) return;
  const newVal = el.value;
  const origVal = String(rec[field] == null ? '' : rec[field]);
  if (!adminToolsDrafts[id]) adminToolsDrafts[id] = {};
  if (String(newVal) === origVal) delete adminToolsDrafts[id][field];
  else adminToolsDrafts[id][field] = newVal;
  if (Object.keys(adminToolsDrafts[id]).length === 0) delete adminToolsDrafts[id];
  const cell = document.querySelector(`.tools-actions[data-id="${id}"]`);
  if (cell) cell.style.display = adminToolsDrafts[id] ? 'inline-flex' : 'none';
}

function onAdminToolButtonClick(e) {
  const id = e.target.dataset.id;
  const act = e.target.dataset.act;
  if (act === 'delete') {
    if (!window.confirm('Remove this tool/edition from the master list?')) return;
    delete adminToolsDrafts[id];
    deleteMasterTool(id);
    renderAdminToolsTable();
    renderToolsHistory();
  } else if (act === 'accept') {
    const draft = adminToolsDrafts[id];
    if (!draft) return;
    Object.entries(draft).forEach(([field, value]) => updateMasterToolField(id, field, value));
    delete adminToolsDrafts[id];
    renderAdminToolsTable();
    renderToolsHistory();
    showToast('Change accepted.');
  } else if (act === 'decline') {
    delete adminToolsDrafts[id];
    renderAdminToolsTable();
    showToast('Change discarded.');
  }
}

function onAdminAddTool() {
  const tool = $('#adminNewToolName').value.trim();
  if (!tool) { showToast('Enter a tool name first.', true); return; }
  const domain = $('#adminNewToolDomain').value;
  addMasterTool(tool, domain, $('#adminNewToolEdition').value, $('#adminNewToolMonthly').value, $('#adminNewToolYearly').value, $('#adminNewToolNotes').value);
  ['adminNewToolName', 'adminNewToolEdition', 'adminNewToolMonthly', 'adminNewToolYearly', 'adminNewToolNotes'].forEach(id => { $('#' + id).value = ''; });
  renderAdminToolsTable();
  renderToolsHistory();
  showToast('Tool added.');
}

function renderTeamHistory() {
  const body = $('#teamHistoryTableBody');
  body.innerHTML = TEAM_HISTORY.map(h => `<tr class="hist-row">
    <td>${new Date(h.time).toLocaleString()}</td><td>${escapeHtml(h.action)}</td><td>${escapeHtml(h.name)}</td>
    <td>${escapeHtml(h.field)}</td><td>${escapeHtml(String(h.oldValue))}</td><td>${escapeHtml(String(h.newValue))}</td>
    <td class="hist-del-cell"><button class="hist-delete" data-id="${h.id}" title="Delete this history entry">✕</button></td>
  </tr>`).join('') || '<tr><td colspan="7" class="hint">No changes yet.</td></tr>';
  body.querySelectorAll('.hist-delete').forEach(btn => btn.addEventListener('click', onDeleteTeamHistoryEntry));
}

function onDeleteTeamHistoryEntry(e) {
  const id = e.target.dataset.id;
  if (!window.confirm('Delete this history entry permanently? This cannot be undone.')) return;
  deleteTeamHistoryEntry(id);
  renderTeamHistory();
}

function renderToolsHistory() {
  const body = $('#toolsHistoryTableBody');
  body.innerHTML = TOOLS_HISTORY.map(h => `<tr class="hist-row">
    <td>${new Date(h.time).toLocaleString()}</td><td>${escapeHtml(h.action)}</td><td>${escapeHtml(h.name)}</td>
    <td>${escapeHtml(h.field)}</td><td>${escapeHtml(String(h.oldValue))}</td><td>${escapeHtml(String(h.newValue))}</td>
    <td class="hist-del-cell"><button class="hist-delete" data-id="${h.id}" title="Delete this history entry">✕</button></td>
  </tr>`).join('') || '<tr><td colspan="7" class="hint">No changes yet.</td></tr>';
  body.querySelectorAll('.hist-delete').forEach(btn => btn.addEventListener('click', onDeleteToolsHistoryEntry));
}

function onDeleteToolsHistoryEntry(e) {
  const id = e.target.dataset.id;
  if (!window.confirm('Delete this history entry permanently? This cannot be undone.')) return;
  deleteToolsHistoryEntry(id);
  renderToolsHistory();
}

let adminCriteriaDrafts = {};

function renderAdminCriteriaTable() {
  const body = $('#adminCriteriaTableBody');
  if (!body) return;
  const searchEl = $('#adminCriteriaSearch');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const rows = MASTER_CRITERIA.filter(c => !q
    || (c.purpose || '').toLowerCase().includes(q)
    || (c.question || '').toLowerCase().includes(q));
  body.innerHTML = rows.map(c => {
    const draft = adminCriteriaDrafts[c.id] || {};
    const purposeVal = draft.purpose !== undefined ? draft.purpose : c.purpose;
    const questionVal = draft.question !== undefined ? draft.question : c.question;
    const dirty = Object.keys(draft).length > 0;
    return `<tr data-drag-id="${c.id}">
      <td class="drag-handle" title="Drag to reorder">\u2820</td>
      <td><input type="text" value="${escapeAttr(purposeVal)}" data-act="purpose" data-id="${c.id}"></td>
      <td><input type="text" value="${escapeAttr(questionVal)}" data-act="question" data-id="${c.id}"></td>
      <td class="row-actions-cell">
        <span class="row-actions criteria-actions" data-id="${c.id}" style="display:${dirty ? 'inline-flex' : 'none'}">
          <button class="row-accept" data-act="accept" data-id="${c.id}" title="Accept this change">\u2713</button>
          <button class="row-decline" data-act="decline" data-id="${c.id}" title="Discard this change">\u27f2</button>
        </span>
        <button class="row-remove" data-act="delete" data-id="${c.id}" title="Delete criterion">\u2715</button>
      </td>
    </tr>`;
  }).join('');
  body.querySelectorAll('input[data-act]').forEach(el => {
    el.addEventListener('input', onAdminCriteriaFieldInput);
    el.addEventListener('change', onAdminCriteriaFieldInput);
  });
  body.querySelectorAll('button[data-act]').forEach(el => el.addEventListener('click', onAdminCriteriaButtonClick));
  wireRowDrag(body, 'criteria');
  refreshCriteriaCounts();
}

function onAdminCriteriaFieldInput(e) {
  const el = e.target;
  const id = el.dataset.id;
  const field = el.dataset.act;
  const rec = MASTER_CRITERIA.find(c => c.id === id);
  if (!rec) return;
  const newVal = el.value;
  const origVal = String(rec[field] == null ? '' : rec[field]);
  if (!adminCriteriaDrafts[id]) adminCriteriaDrafts[id] = {};
  if (String(newVal) === origVal) delete adminCriteriaDrafts[id][field];
  else adminCriteriaDrafts[id][field] = newVal;
  if (Object.keys(adminCriteriaDrafts[id]).length === 0) delete adminCriteriaDrafts[id];
  const cell = document.querySelector(`.criteria-actions[data-id="${id}"]`);
  if (cell) cell.style.display = adminCriteriaDrafts[id] ? 'inline-flex' : 'none';
}

function onAdminCriteriaButtonClick(e) {
  const id = e.target.dataset.id;
  const act = e.target.dataset.act;
  if (act === 'delete') {
    if (!window.confirm(`Remove this criterion from the checklist? New documents will use the remaining ${MASTER_CRITERIA.length - 1} (or fewer).`)) return;
    delete adminCriteriaDrafts[id];
    deleteMasterCriteria(id);
    renderAdminCriteriaTable();
    renderCriteriaHistory();
  } else if (act === 'accept') {
    const draft = adminCriteriaDrafts[id];
    if (!draft) return;
    Object.entries(draft).forEach(([field, value]) => updateMasterCriteriaField(id, field, value));
    delete adminCriteriaDrafts[id];
    renderAdminCriteriaTable();
    renderCriteriaHistory();
    showToast('Change accepted.');
  } else if (act === 'decline') {
    delete adminCriteriaDrafts[id];
    renderAdminCriteriaTable();
    showToast('Change discarded.');
  }
}

function onAdminAddCriteria() {
  const purpose = $('#adminNewCriteriaPurpose').value.trim();
  const question = $('#adminNewCriteriaQuestion').value.trim();
  if (!purpose) { showToast('Enter a purpose/label first.', true); return; }
  addMasterCriteria(purpose, question);
  ['adminNewCriteriaPurpose', 'adminNewCriteriaQuestion'].forEach(id => { $('#' + id).value = ''; });
  renderAdminCriteriaTable();
  renderCriteriaHistory();
  showToast('Criterion added.');
}

function renderCriteriaHistory() {
  const body = $('#criteriaHistoryTableBody');
  if (!body) return;
  body.innerHTML = CRITERIA_HISTORY.map(h => `<tr class="hist-row">
    <td>${new Date(h.time).toLocaleString()}</td><td>${escapeHtml(h.action)}</td><td>${escapeHtml(h.name)}</td>
    <td>${escapeHtml(h.field)}</td><td>${escapeHtml(String(h.oldValue))}</td><td>${escapeHtml(String(h.newValue))}</td>
    <td class="hist-del-cell"><button class="hist-delete" data-id="${h.id}" title="Delete this history entry">\u2715</button></td>
  </tr>`).join('') || '<tr><td colspan="7" class="hint">No changes yet.</td></tr>';
  body.querySelectorAll('.hist-delete').forEach(btn => btn.addEventListener('click', onDeleteCriteriaHistoryEntry));
}

function onDeleteCriteriaHistoryEntry(e) {
  const id = e.target.dataset.id;
  if (!window.confirm('Delete this history entry permanently? This cannot be undone.')) return;
  deleteCriteriaHistoryEntry(id);
  renderCriteriaHistory();
}

/* ---------- Admin sub-tabs (Team / Criteria / Tools / History) ---------- */
function switchAdminTab(tab) {
  ['defaults', 'team', 'criteria', 'history', 'llmcontext', 'logo'].forEach(t => {
    const panel = $('#adminPanel-' + t);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
  });
  $all('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.adminTab === tab));
}

function switchHistoryPanel(which) {
  ['team', 'tools', 'criteria'].forEach(t => {
    const card = $('#' + t + 'HistoryCard');
    if (card) card.style.display = t === which ? 'block' : 'none';
  });
}

function wireAdminSubTabs() {
  $all('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => switchAdminTab(btn.dataset.adminTab));
  });
  const picker = $('#historyPicker');
  if (picker) {
    picker.addEventListener('change', () => switchHistoryPanel(picker.value));
    switchHistoryPanel(picker.value);
  }
}

function renderRolesManageList() {
  const wrap = $('#rolesManageList');
  if (!wrap) return;
  if (!CUSTOM_ROLES.length) {
    wrap.innerHTML = '<p class="hint">No roles yet — use "+ New role" above to add one.</p>';
    return;
  }
  wrap.innerHTML = CUSTOM_ROLES.map(r => `
    <div class="ai-history-row" style="cursor:default">
      <span class="ai-history-row-title">${escapeHtml(r)}</span>
      <button class="btn small secondary" data-remove-role="${escapeAttr(r)}">Remove</button>
    </div>
  `).join('');
  wrap.querySelectorAll('[data-remove-role]').forEach(btn => {
    btn.addEventListener('click', () => {
      removeCustomRole(btn.dataset.removeRole);
      populateAdminRoleSelect();
      renderAdminTeamTable();
      renderRolesManageList();
      showToast(`Role "${btn.dataset.removeRole}" removed.`);
    });
  });
}

let adminTemplateId = null;
let adminTemplateDocKey = 'prd';

// Populates the category <select> and restores/repairs the current
// selection, falling back to the first template if the remembered id no
// longer exists (e.g. it was deleted).
function populateTemplateCategorySelect() {
  const sel = $('#tmplCategorySelect');
  if (!sel) return;
  sel.innerHTML = MASTER_TEMPLATE_LIBRARY.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  const hasCurrent = MASTER_TEMPLATE_LIBRARY.some(t => t.id === adminTemplateId);
  if (!hasCurrent) adminTemplateId = MASTER_TEMPLATE_LIBRARY[0] ? MASTER_TEMPLATE_LIBRARY[0].id : null;
  sel.value = adminTemplateId || '';
}

function renderTemplateSectionList() {
  const wrap = $('#tmplSectionList');
  if (!wrap) return;
  const cat = getTemplateCategory(adminTemplateId);
  const list = (cat && cat.sections[adminTemplateDocKey]) || [];
  wrap.innerHTML = list.length ? list.map((name, i) => `
    <div class="tmpl-section-row" data-drag-idx="${i}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border, #e5e5e5)">
      <span class="drag-handle" title="Drag to reorder" style="cursor:grab">⠿</span>
      <input type="text" value="${escapeAttr(name)}" data-idx="${i}" class="tmpl-section-input" style="flex:1">
      <button class="btn small secondary tmpl-section-delete" data-idx="${i}" title="Remove section">✕</button>
    </div>
  `).join('') : '<p class="hint">No sections yet — add one below.</p>';

  wrap.querySelectorAll('.tmpl-section-input').forEach(el => {
    el.addEventListener('change', e => {
      updateTemplateSection(adminTemplateId, adminTemplateDocKey, Number(e.target.dataset.idx), e.target.value);
      renderTemplateSectionList();
      refreshCriteriaCounts();
      const status = $('#tmplStatus');
      if (status) status.textContent = 'Saved.';
    });
  });
  wrap.querySelectorAll('.tmpl-section-delete').forEach(el => {
    el.addEventListener('click', e => {
      const idx = Number(e.target.dataset.idx);
      if (!window.confirm('Remove this section from the template?')) return;
      deleteTemplateSection(adminTemplateId, adminTemplateDocKey, idx);
      renderTemplateSectionList();
      refreshCriteriaCounts();
    });
  });
  wireTemplateSectionDrag(wrap);
}

// Native HTML5 drag-and-drop reorder, same pattern as wireRowDrag but
// index-based (template sections are plain strings, no stable id).
function wireTemplateSectionDrag(wrap) {
  let draggedIdx = null;
  wrap.querySelectorAll('[data-drag-idx]').forEach(row => {
    const handle = row.querySelector('.drag-handle');
    if (handle) {
      handle.setAttribute('draggable', 'true');
      handle.addEventListener('dragstart', () => {
        draggedIdx = Number(row.dataset.dragIdx);
        row.classList.add('dragging');
      });
      handle.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        wrap.querySelectorAll('[data-drag-idx]').forEach(r => r.classList.remove('drag-over'));
      });
    }
    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (Number(row.dataset.dragIdx) !== draggedIdx) row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const targetIdx = Number(row.dataset.dragIdx);
      if (draggedIdx === null || draggedIdx === targetIdx) return;
      reorderTemplateSection(adminTemplateId, adminTemplateDocKey, draggedIdx, targetIdx);
      renderTemplateSectionList();
    });
  });
}

function switchTemplateDocKey(docKey) {
  adminTemplateDocKey = docKey;
  $all('#tmplDocTypeTabs .tmpl-doc-tab').forEach(b => b.classList.toggle('active', b.dataset.docKey === docKey));
  renderTemplateSectionList();
}

function renderTemplateLibraryPanel() {
  populateTemplateCategorySelect();
  renderTemplateSectionList();
}

function wireTemplateLibraryPanel() {
  const catSel = $('#tmplCategorySelect');
  if (!catSel) return;

  catSel.addEventListener('change', e => {
    adminTemplateId = e.target.value;
    renderTemplateSectionList();
  });

  $all('#tmplDocTypeTabs .tmpl-doc-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTemplateDocKey(btn.dataset.docKey));
  });

  $('#tmplAddCategoryBtn').addEventListener('click', () => {
    const input = $('#tmplNewCategoryInput');
    const name = input.value.trim();
    if (!name) { showToast('Enter a category name first.', true); return; }
    const rec = addTemplateCategory(name);
    input.value = '';
    adminTemplateId = rec.id;
    populateTemplateCategorySelect();
    renderTemplateSectionList();
    populateTemplateSelect(); // keep the Document step's dropdown in sync
    showToast('Template category added.');
  });

  $('#tmplRenameCategoryBtn').addEventListener('click', () => {
    const cat = getTemplateCategory(adminTemplateId);
    if (!cat) return;
    const name = window.prompt('Rename template category:', cat.name);
    if (name === null) return;
    renameTemplateCategory(adminTemplateId, name);
    populateTemplateCategorySelect();
    populateTemplateSelect();
    showToast('Template renamed.');
  });

  $('#tmplDeleteCategoryBtn').addEventListener('click', () => {
    const cat = getTemplateCategory(adminTemplateId);
    if (!cat) return;
    if (MASTER_TEMPLATE_LIBRARY.length <= 1) { showToast('At least one template category must remain.', true); return; }
    if (!window.confirm(`Delete the "${cat.name}" template category and all its sections? This cannot be undone.`)) return;
    deleteTemplateCategory(adminTemplateId);
    adminTemplateId = null;
    populateTemplateCategorySelect();
    renderTemplateSectionList();
    populateTemplateSelect();
    showToast('Template category deleted.');
  });

  $('#tmplAddSectionBtn').addEventListener('click', () => {
    const input = $('#tmplNewSectionInput');
    const name = input.value.trim();
    if (!name) { showToast('Enter a section name first.', true); return; }
    addTemplateSection(adminTemplateId, adminTemplateDocKey, name);
    input.value = '';
    renderTemplateSectionList();
    refreshCriteriaCounts();
  });
  $('#tmplNewSectionInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#tmplAddSectionBtn').click(); }
  });
}


function renderAdminTabs() {
  populateAdminRoleSelect();
  renderRolesManageList();
  renderAdminTeamTable();
  renderTemplateLibraryPanel();
  renderCriteriaHistory();
  renderTeamHistory();
  renderToolsHistory();
  renderLogoTab();
}

// Scales an uploaded image down to fit within maxW x maxH, preserving
// aspect ratio exactly (never stretched, never cropped) -- only ever
// shrinks, never upscales a smaller image. Returns a PNG data URI, which
// works identically embedded in the on-screen preview, Word export, and
// PDF export (pdfMake's image node accepts a data URI directly).
function autoFitImageToDataUri(file, maxW, maxH) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('Choose an image file.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load the image — is it a valid image file?'));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width, maxH / img.height); // never upscale, only shrink to fit
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        // Dimensions come back too: Word's HTML renderer ignores CSS
        // max-width/max-height on <img>, so templates need explicit
        // width/height attributes to size logos correctly there.
        resolve({ dataUri: canvas.toDataURL('image/png'), width: w, height: h });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Scales a stored logo's natural size down to fit a display box,
// preserving aspect ratio exactly. Used to emit explicit width/height
// attributes on <img> for Word, and a matching width for pdfMake.
function logoDisplaySize(naturalW, naturalH, maxW, maxH) {
  const w = Number(naturalW) || 0;
  const h = Number(naturalH) || 0;
  if (!w || !h) return { width: maxW, height: null }; // unknown natural size -- constrain by width only, let aspect follow
  const scale = Math.min(1, maxW / w, maxH / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

let pendingNewLogo = null; // { dataUri, width, height }

function renderLogoTab() {
  const currentPreview = $('#currentLogoPreview');
  if (currentPreview) currentPreview.src = activeCompanyLogo();
  const revokeBtn = $('#logoRevokeBtn');
  if (revokeBtn) revokeBtn.style.display = STATE.settings.previousCompanyLogo ? 'inline-flex' : 'none';
}

function wireLogoTab() {
  $('#logoUploadInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = $('#logoStatus');
    if (status) status.textContent = 'Processing image...';
    try {
      pendingNewLogo = await autoFitImageToDataUri(file, 420, 300);
      $('#newLogoPreview').src = pendingNewLogo.dataUri;
      $('#newLogoPreviewBox').style.display = 'flex';
      $('#newLogoEmptyHint').style.display = 'none';
      $('#logoAcceptBtn').disabled = false;
      if (status) status.textContent = 'Ready — click "Accept new logo" to use it in generated documents.';
    } catch (err) {
      showToast('Could not process that image: ' + err.message, true);
      console.error('Logo upload failed', err);
      if (status) status.textContent = 'Error: ' + err.message;
    }
  });

  $('#logoAcceptBtn').addEventListener('click', () => {
    if (!pendingNewLogo) return;
    STATE.settings.previousCompanyLogo = STATE.settings.companyLogo || DEFAULT_LOGO_DATA_URI;
    STATE.settings.previousCompanyLogoW = STATE.settings.companyLogoW || DEFAULT_LOGO_W;
    STATE.settings.previousCompanyLogoH = STATE.settings.companyLogoH || DEFAULT_LOGO_H;
    STATE.settings.companyLogo = pendingNewLogo.dataUri;
    STATE.settings.companyLogoW = pendingNewLogo.width;
    STATE.settings.companyLogoH = pendingNewLogo.height;
    persist();
    pendingNewLogo = null;
    $('#logoUploadInput').value = '';
    $('#newLogoPreviewBox').style.display = 'none';
    $('#newLogoEmptyHint').style.display = 'block';
    $('#logoAcceptBtn').disabled = true;
    renderLogoTab();
    showToast('Logo updated — used in every generated document from now on.');
    $('#logoStatus').textContent = '';
  });

  $('#logoRevokeBtn').addEventListener('click', () => {
    if (!STATE.settings.previousCompanyLogo) return;
    if (!window.confirm('Restore the previous logo? This undoes the last accepted change.')) return;
    STATE.settings.companyLogo = STATE.settings.previousCompanyLogo;
    STATE.settings.companyLogoW = STATE.settings.previousCompanyLogoW || null;
    STATE.settings.companyLogoH = STATE.settings.previousCompanyLogoH || null;
    STATE.settings.previousCompanyLogo = '';
    STATE.settings.previousCompanyLogoW = null;
    STATE.settings.previousCompanyLogoH = null;
    persist();
    renderLogoTab();
    showToast('Reverted to the previous logo.');
  });
}

function wireAdmin() {
  wireAdminSubTabs();
  wireLogoTab();

  const ctxInput = $('#ollamaContextLengthInput');
  if (ctxInput) {
    ctxInput.value = STATE.settings.ollamaContextLength || '';
    ctxInput.addEventListener('input', e => {
      STATE.settings.ollamaContextLength = e.target.value;
      persist();
    });
  }

  $('#adminAddMemberBtn').addEventListener('click', onAdminAddMember);
  wireTemplateLibraryPanel();

  $('#adminNewRoleBtn').addEventListener('click', () => {
    const name = window.prompt('New role name:');
    if (!name || !name.trim()) return;
    const added = addCustomRole(name);
    if (!added) return;
    populateAdminRoleSelect();
    $('#adminNewMemberRole').value = added;
    renderRolesManageList();
    showToast(`Role "${added}" added.`);
  });
  const rolesToggle = $('#rolesManageToggle');
  const rolesPanel = $('#rolesManagePanel');
  if (rolesToggle && rolesPanel) {
    rolesToggle.addEventListener('click', () => {
      const nowHidden = rolesPanel.classList.toggle('hidden');
      rolesToggle.textContent = nowHidden ? 'Manage roles ▾' : 'Manage roles ▴';
    });
  }

  $('#adminTeamSearch').addEventListener('input', renderAdminTeamTable);

  $('#adminTeamSortBtn').addEventListener('click', () => {
    sortMasterTeamAlpha();
    renderAdminTeamTable();
    showToast('Team members arranged A–Z.');
  });

  $('#exportDataBtn').addEventListener('click', () => {
    try {
      exportAllData();
      showToast('data.json downloaded.');
    } catch (e) {
      showToast('Export failed: ' + e.message, true);
      console.error('Export failed', e);
    }
  });
  $('#importDataBtn').addEventListener('click', () => $('#importDataInput').click());
  $('#importDataInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.confirm('Import data.json? This overwrites the current Setup, team & tools, history, and Pending drafts, then reloads the app.')) {
      e.target.value = '';
      return;
    }
    try {
      await importAllData(file);
    } catch (err) {
      showToast('Import failed: ' + err.message, true);
      console.error('Import failed', err);
    }
  });
}

/* ---------- Step 3: Team & Tools (dropdown add-flow) ---------- */
function populateMemberSelect() {
  const sel = $('#addMemberSelect');
  const available = STATE.team.filter(m => !m.included);
  if (!available.length) {
    sel.innerHTML = '<option value="">All members added</option>';
    sel.disabled = true;
    $('#addMemberBtn').disabled = true;
    return;
  }
  sel.disabled = false;
  $('#addMemberBtn').disabled = false;
  sel.innerHTML = available.map(m => `<option value="${m.id}">${escapeHtml(m.name)} — ${fmtMoney(m.costPerHour)}/hr</option>`).join('');
}

function renderTeamTable() {
  const body = $('#teamTableBody');
  const included = STATE.team.filter(m => m.included);
  $('#teamEmptyHint').style.display = included.length ? 'none' : 'block';
  body.innerHTML = included.map(m => {
    const cost = memberLineCost(m);
    const roleCell = m.role === 'CMD'
      ? `<span title="Fixed role">CMD</span>`
      : `<select data-act="member-role" data-id="${m.id}">
          <option value="">— choose —</option>
          ${roleOptionsHtml(m.role)}
        </select>`;
    return `
      <tr>
        <td>${escapeHtml(m.name)}</td>
        <td>${roleCell}</td>
        <td><input type="number" min="0" step="10" value="${m.costPerHour}" data-act="member-rate" data-id="${m.id}"></td>
        <td><input type="number" min="0" value="${m.hoursMapping}" data-act="member-hrs-mapping" data-id="${m.id}"></td>
        <td><input type="number" min="0" value="${m.hoursImplementation}" data-act="member-hrs-impl" data-id="${m.id}"></td>
        <td><input type="number" min="0" value="${m.hoursHypercare}" data-act="member-hrs-hyper" data-id="${m.id}"></td>
        <td>${fmtMoney(cost)}</td>
        <td><button class="row-remove" data-act="member-remove" data-id="${m.id}">✕</button></td>
      </tr>`;
  }).join('');
  body.querySelectorAll('input, select').forEach(el => el.addEventListener('input', onTeamCellChange));
  body.querySelectorAll('button').forEach(el => el.addEventListener('click', onTeamCellChange));
}

function onTeamCellChange(e) {
  const el = e.target;
  const id = el.dataset.id;
  const m = STATE.team.find(x => x.id === id);
  if (!m) return;
  switch (el.dataset.act) {
    case 'member-rate': m.costPerHour = Number(el.value) || 0; break;
    case 'member-role': m.role = el.value; break;
    case 'member-hrs-mapping': m.hoursMapping = Number(el.value) || 0; break;
    case 'member-hrs-impl': m.hoursImplementation = Number(el.value) || 0; break;
    case 'member-hrs-hyper': m.hoursHypercare = Number(el.value) || 0; break;
    case 'member-remove': m.included = false; m.hoursMapping = 0; m.hoursImplementation = 0; m.hoursHypercare = 0; break;
  }
  persist();
  populateMemberSelect();
  renderTeamTable();
  renderCostingSummary();
}

function populateToolSelects() {
  const toolSel = $('#addToolSelect');
  const currentTool = toolSel.value;
  const uniqueTools = Array.from(new Set(STATE.tools.map(t => t.tool))).sort();
  toolSel.innerHTML = uniqueTools.map(name => `<option value="${escapeAttr(name)}" ${name === currentTool ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
  populateEditionSelect();
}

function populateEditionSelect() {
  const toolSel = $('#addToolSelect');
  const editionSel = $('#addEditionSelect');
  const chosenTool = toolSel.value;
  const available = STATE.tools.filter(t => t.tool === chosenTool && !t.included);
  if (!available.length) {
    editionSel.innerHTML = '<option value="">All editions added</option>';
    editionSel.disabled = true;
    $('#addToolBtn').disabled = true;
    return;
  }
  editionSel.disabled = false;
  $('#addToolBtn').disabled = false;
  editionSel.innerHTML = available.map(t => `<option value="${escapeAttr(t.edition)}">${escapeHtml(t.edition)}${t.notes ? ' (' + escapeHtml(t.notes) + ')' : ''}</option>`).join('');
}

function renderToolTable() {
  const body = $('#toolTableBody');
  const included = STATE.tools.filter(t => t.included);
  $('#toolEmptyHint').style.display = included.length ? 'none' : 'block';
  body.innerHTML = included.map(t => {
    const cost = toolLineCost(t);
    return `
      <tr>
        <td>${escapeHtml(t.tool)}</td>
        <td>${escapeHtml(t.edition)}</td>
        <td>${escapeHtml(t.notes || '')}</td>
        <td><input type="number" min="0" value="${t.qty}" data-act="tool-qty" data-id="${t.id}"></td>
        <td>
          <select data-act="tool-cycle" data-id="${t.id}">
            <option value="monthly" ${t.cycle === 'monthly' ? 'selected' : ''} ${t.monthly == null ? 'disabled' : ''}>Monthly</option>
            <option value="yearly" ${t.cycle === 'yearly' ? 'selected' : ''} ${t.yearly == null ? 'disabled' : ''}>Yearly</option>
          </select>
        </td>
        <td>${fmtMoney(cost)}</td>
        <td><button class="row-remove" data-act="tool-remove" data-id="${t.id}">✕</button></td>
      </tr>`;
  }).join('');
  body.querySelectorAll('input, select').forEach(el => el.addEventListener('input', onToolCellChange));
  body.querySelectorAll('button').forEach(el => el.addEventListener('click', onToolCellChange));
}

function onToolCellChange(e) {
  const el = e.target;
  const id = el.dataset.id;
  const t = STATE.tools.find(x => x.id === id);
  if (!t) return;
  switch (el.dataset.act) {
    case 'tool-qty': t.qty = Number(el.value) || 0; break;
    case 'tool-cycle': t.cycle = el.value; break;
    case 'tool-remove': t.included = false; t.qty = 1; break;
  }
  persist();
  populateToolSelects();
  renderToolTable();
  renderCostingSummary();
}

function renderCostingSummary() {
  const c = computeCosting();
  const el = $('#costingSummary');
  el.innerHTML = `
    <table>
      <tr><td>Solution Mapping</td><td>${fmtMoney(c.stages.mapping)}</td></tr>
      <tr><td>Phase 1 Implementation</td><td>${fmtMoney(c.stages.implementation)}</td></tr>
      <tr><td>Post Go-Live Hypercare</td><td>${fmtMoney(c.stages.hypercare)}</td></tr>
      <tr class="total-row"><td>Total Implementation (excl. GST)</td><td>${fmtMoney(c.implementationTotal)}</td></tr>
      <tr><td>GST (${c.gstPct}%)</td><td>${fmtMoney(c.gstAmount)}</td></tr>
      <tr class="total-row"><td>Total incl. GST</td><td>${fmtMoney(c.implementationWithGst)}</td></tr>
    </table>
    <table>
      <tr><td>Zoho licences — monthly-billed total</td><td>${fmtMoney(c.toolsMonthlyTotal)}/mo</td></tr>
      <tr><td>Zoho licences — yearly-billed total</td><td>${fmtMoney(c.toolsYearlyTotal)}/yr</td></tr>
      <tr class="total-row"><td>Annualised licence cost</td><td>${fmtMoney(c.licenceAnnualTotal)}/yr</td></tr>
    </table>
  `;
}

function wireTeamTools() {
  $('#addMemberBtn').addEventListener('click', () => {
    const id = $('#addMemberSelect').value;
    if (!id) return;
    const m = STATE.team.find(x => x.id === id);
    if (!m) return;
    m.included = true;
    persist();
    populateMemberSelect();
    renderTeamTable();
    renderCostingSummary();
  });

  $('#addCustomMemberBtn').addEventListener('click', () => {
    const name = window.prompt('New team member name:');
    if (!name || !name.trim()) return;
    const rateRaw = window.prompt('Cost per hour (₹):', '500');
    const rate = Number(rateRaw);
    const roleRaw = window.prompt('Role (' + allRoleOptions().join(' / ') + ') — leave blank if none:', '');
    const role = allRoleOptions().includes((roleRaw || '').trim()) ? roleRaw.trim() : '';
    const id = 'team-custom-' + Date.now();
    STATE.team.push({
      id, name: name.trim(), costPerHour: isNaN(rate) ? 500 : rate, role,
      included: true, hoursMapping: 0, hoursImplementation: 0, hoursHypercare: 0
    });
    persist();
    populateMemberSelect();
    renderTeamTable();
    renderCostingSummary();
  });

  $('#addToolSelect').addEventListener('change', populateEditionSelect);

  $('#addToolBtn').addEventListener('click', () => {
    const toolName = $('#addToolSelect').value;
    const edition = $('#addEditionSelect').value;
    if (!toolName || !edition) return;
    const t = STATE.tools.find(x => x.tool === toolName && x.edition === edition && !x.included);
    if (!t) return;
    t.included = true;
    t.qty = Number($('#addToolQty').value) || 1;
    const requestedCycle = $('#addToolCycle').value;
    t.cycle = (requestedCycle === 'yearly' && t.yearly != null) ? 'yearly'
      : (requestedCycle === 'monthly' && t.monthly != null) ? 'monthly'
      : (t.yearly != null ? 'yearly' : 'monthly');
    persist();
    populateToolSelects();
    renderToolTable();
    renderCostingSummary();
  });

  $('#resetTeamToolsBtn').addEventListener('click', resetTeamTools);
}

function resetTeamTools() {
  const hasAny = STATE.team.some(m => m.included) || STATE.tools.some(t => t.included);
  if (!hasAny) { showToast('Nothing to reset.'); return; }
  if (!window.confirm('Reset team & tools? This removes everyone added, drops any custom members, and clears all tool selections. The uploaded document and any generated proposal stay as they are.')) return;

  STATE.team = STATE.team
    .filter(m => !m.id.startsWith('team-custom-'))
    .map(m => {
      const original = MASTER_TEAM.find(d => d.name === m.name);
      return {
        ...m,
        costPerHour: original ? original.costPerHour : m.costPerHour,
        included: false,
        hoursMapping: 0,
        hoursImplementation: 0,
        hoursHypercare: 0
      };
    });

  STATE.tools = STATE.tools.map(t => ({
    ...t,
    included: false,
    qty: 1,
    cycle: t.yearly != null ? 'yearly' : 'monthly'
  }));

  persist();
  populateMemberSelect();
  populateToolSelects();
  renderTeamTable();
  renderToolTable();
  renderCostingSummary();
  showToast('Team & tools reset.');
}

/* ---------- Step 4: Review & Export ---------- */
function setGenStatus(msg) {
  const a = $('#genFlowStatus');
  const b = $('#exportStatus');
  if (a) a.textContent = msg;
  if (b) b.textContent = msg;
}

function setToolbarBusy(busy) {
  ['#downloadBtn', '#regenBtn', '#resetBtn', '#exportFormat', '#aiEditBtn'].forEach(sel => {
    const node = $(sel);
    if (node) node.disabled = busy;
  });
}

// Makes every text-bearing element the user should be able to edit directly
// contenteditable, without nesting editable regions inside one another.
function makeEditable(container) {
  container.querySelectorAll('h1.doc-title, h2.doc-subtitle, h3.sec, h4.subsec, p, li, div.editable, td, th, .callout b, .callout span')
    .forEach(el => el.setAttribute('contenteditable', 'true'));
}

// Captures the live (possibly hand-edited) HTML as the new source of truth,
// debounced so rapid typing doesn't spam localStorage writes.
function wireLiveEditCapture() {
  const el = $('#proposalPreview');
  let saveTimer;
  el.addEventListener('input', (e) => {
    if (!e.target.closest('[contenteditable="true"]')) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      STATE.editedHtml = el.innerHTML;
      persist();
    }, 500);
  });
}

// The four things that must be true before generation is allowed. Centralized
// here so the "Ready to generate" list and the pre-generate modal always agree.
function getReadinessChecks() {
  const chars = STATE.prelimText.trim().length;
  const costing = computeCosting();
  const docLabel = STATE.docType === 'requirement' ? 'Detailed Requirement Document' : 'Preliminary Requirement Document';
  return [
    { ok: chatReady(), okLabel: isOllamaChat() ? `Chat model set (Ollama: ${STATE.settings.ollamaChatModel})` : isCustomApiChat() ? `Chat model set (OmniRoute: ${STATE.settings.customApiChatModel})` : isNvidiaChat() ? `Chat model set (NVIDIA NIM: ${STATE.settings.nvidiaChatModel})` : 'OpenRouter API key is set', missingLabel: 'Chat model is not set up yet', step: '1', stepName: 'Setup' },
    { ok: chars > 40, okLabel: `${docLabel}: ${chars.toLocaleString()} characters`, missingLabel: `No document uploaded yet (${docLabel})`, step: '2', stepName: 'Document' },
    { ok: costing.team.length > 0, okLabel: `${costing.team.length} team member(s) added`, missingLabel: 'No team members added yet', step: '3', stepName: 'Team & Tools' },
    { ok: costing.tools.length > 0, okLabel: `${costing.tools.length} tool line(s) added`, missingLabel: 'No tools added yet', step: '3', stepName: 'Team & Tools' }
  ];
}

function attemptGenerate(triggerBtn) {
  const checks = getReadinessChecks();
  const missing = checks.filter(c => !c.ok);
  if (missing.length) { showMissingModal(missing); return; }
  autoAgreeChecklist(); // silently agree any met-but-unconfirmed checklist item first
  generateProposalFlow(triggerBtn);
}

function showMissingModal(missing) {
  closeMissingModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'missingModalOverlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" id="missingModalClose" title="Close">✕</button>
      <h2>Fill this in first</h2>
      <p class="hint" style="margin:0 0 12px">A few things still need filling in before a proposal can be generated:</p>
      <ul class="modal-missing-list">
        ${missing.map(m => `<li>${escapeHtml(m.missingLabel)}<button class="btn small secondary modal-goto" data-step="${m.step}">Go to ${escapeHtml(m.stepName)}</button></li>`).join('')}
      </ul>
    </div>`;
  document.body.appendChild(overlay);
  $('#missingModalClose').addEventListener('click', closeMissingModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeMissingModal(); });
  overlay.querySelectorAll('.modal-goto').forEach(btn => btn.addEventListener('click', () => {
    closeMissingModal();
    goToStep(btn.dataset.step);
  }));
}

function closeMissingModal() {
  const existing = document.getElementById('missingModalOverlay');
  if (existing) existing.remove();
}

// Triggered by the "Create Detailed Requirement Document" card (preliminary
// flow only, shown once checklistReady). Confirms intent with a popup
// before spending an AI call, since generating a DRD folds in everything
// confirmed so far and becomes the canonical source of truth from here on.
function onCreateDrdClick() {
  closeDrdConfirmModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'drdConfirmModalOverlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" id="drdConfirmModalClose" title="Close">✕</button>
      <h2>Create Detailed Requirement Document</h2>
      <p class="hint" style="margin:0 0 16px">This folds the preliminary document, agreed checklist answers, and any answered questions into a proper Detailed Requirement Document — the single source of truth from here on for Team &amp; Tools and generating the Proposal/Scope of Work.</p>
      <div class="add-row" style="margin-bottom:0">
        <button class="btn primary small" id="drdConfirmCreateBtn">Create Detailed Requirement Document</button>
        <button class="btn secondary small" id="drdConfirmSaveBtn">Save for later</button>
        <button class="btn secondary small" id="drdConfirmCancelBtn">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  $('#drdConfirmModalClose').addEventListener('click', closeDrdConfirmModal);
  $('#drdConfirmCancelBtn').addEventListener('click', closeDrdConfirmModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDrdConfirmModal(); });
  $('#drdConfirmSaveBtn').addEventListener('click', () => { closeDrdConfirmModal(); saveForLater(); });
  $('#drdConfirmCreateBtn').addEventListener('click', () => { closeDrdConfirmModal(); runGenerateDrd(); });
}

function closeDrdConfirmModal() {
  const existing = document.getElementById('drdConfirmModalOverlay');
  if (existing) existing.remove();
}

async function runGenerateDrd() {
  if (!chatReady()) { showToast('Set up a chat model (OpenRouter key, Ollama, or OmniRoute) in Setup first.', true); goToStep(1); return; }
  if (!STATE.prelimText.trim()) { showToast('Upload or paste a document first.', true); return; }
  if (STATE.drdText.trim() && !window.confirm('Regenerating will replace the current Detailed Requirement Document and its solution suggestions (any edits will be lost). Continue?')) return;
  const btn = $('#createDrdBtn');
  const status = $('#aiVerifyStatus');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Checking your Knowledge Base for previous solutions...';
  try {
    // Both the DRD and the solution suggestions come back from ONE call --
    // they read the same source material, so splitting them was doubling
    // cost and latency for no benefit.
    const prevSolutions = await kbFetchPreviousSolutionsContext(STATE.prelimText);
    if (status) status.textContent = (prevSolutions
      ? `Found relevant material in ${(prevSolutions.sources || []).join(', ')}`
      : 'No Previous Solutions on file') + ' — building the Detailed Requirement Document and solution suggestions...';
    const availableToolsText = [...new Set(MASTER_TOOLS.map(t => `${t.tool} (${t.edition}) — ${t.domain ? formatDomainLabel(t.domain) : 'uncategorized'}`))].join('\n');
    const result = await generateDrdAndSolutions(
      STATE.prelimText, STATE.checklist, STATE.qa, prevSolutions, availableToolsText,
      (delta, full) => { if (status) status.textContent = `Building the Detailed Requirement Document — ${full.length.toLocaleString()} characters so far...`; }
    );

    ['clientCompany', 'clientContact'].forEach(key => {
      const val = (result[key] || '').trim();
      if (val && !STATE.client[key].trim()) STATE.client[key] = val;
    });
    STATE.drd = result;
    STATE.drdHtml = buildDrdHtml(result);
    STATE.drdText = drdStructuredToText(result); // plain-text form is what downstream Proposal/SOW generation reads
    STATE.solutions = (result.solutions || []).map((s, i) => ({
      id: 'sol-' + Date.now() + '-' + i,
      name: s.name || `Solution ${i + 1}`,
      description: s.description || '',
      tools: s.tools || [],
      requirementsAddressed: s.requirementsAddressed || [],
      sourceType: s.sourceType || 'research',
      sourceNote: s.sourceNote || '',
      status: 'pending'
    }));
    persist();
    renderDrdReviewSection();
    showToast(`Detailed Requirement Document created, with ${STATE.solutions.length} solution suggestion(s).`);
    if (status) status.textContent = 'Detailed Requirement Document and solution suggestions created just now.';
    const section = $('#drdReviewSection');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    showToast('Could not create the Detailed Requirement Document: ' + e.message, true);
    console.error('DRD generation failed', e);
    if (status) status.textContent = 'Error: ' + e.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Renders the structured DRD (assets/openrouter.js: generateDrdAndSolutions)
// as a proper formatted document -- same logo row, header/footer bands,
// title page and CSS classes as the Proposal and SOW, rather than the raw
// prose blob this used to produce.
function buildDrdHtml(drd) {
  const c = STATE.client, s = STATE.settings;
  const clientName = c.clientCompany || drd.clientCompany || '';
  const metaRows = [
    ['Document No', drd.docNumber || c.docNumber || ''],
    ['Version', c.docVersion || 'V1.0'],
    ['Client', clientName],
    ['Primary Contact', c.clientContact || drd.clientContact || ''],
    ['Prepared by', s.providerName],
    ['Date', new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })]
  ];
  return `
    ${logoRowHtml(c, s)}
    <table class="doc-header-band"><tr>
      <td class="doc-header-left"><b>DETAILED REQUIREMENT DOCUMENT</b> &nbsp;|&nbsp; ${esc(clientName)}</td>
      <td class="doc-header-right">${esc(s.providerName)}</td>
    </tr></table>
    <h1 class="doc-title">DETAILED REQUIREMENT DOCUMENT</h1>
    <h2 class="doc-subtitle">${esc(clientName)}</h2>
    ${drd.docTagline ? `<p class="editable" style="margin-top:-16px;color:var(--muted,#6b7280);font-size:13px">${esc(drd.docTagline)}</p>` : ''}
    <table class="meta-table">${metaRows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    ${drd.introBody ? `<div class="callout"><span><i>${esc(drd.introBody)}</i></span></div>` : ''}

    ${(drd.sections || []).map((sec, i) => `
      <h3 class="sec">${i + 1}. ${esc(sec.heading || '')}</h3>
      ${(sec.paragraphs || []).map(p => `<p class="editable">${esc(p)}</p>`).join('')}
      ${(sec.bullets || []).length ? `<ul>${sec.bullets.map(b => `<li class="editable">${esc(b)}</li>`).join('')}</ul>` : ''}
    `).join('')}

    <table class="doc-footer-band"><tr>
      <td>${esc(s.providerTagline)}</td>
      <td class="doc-footer-right">${esc(drd.docNumber || c.docNumber || '')}</td>
    </tr></table>
  `;
}

// Flattens the structured DRD back to plain text -- this is what the
// Proposal and SOW generation prompts read as their source of truth, so
// it must stay in sync with whatever's actually in the document.
function drdStructuredToText(drd) {
  const parts = [];
  if (drd.introBody) parts.push(drd.introBody);
  (drd.sections || []).forEach((sec, i) => {
    parts.push(`${i + 1}. ${sec.heading || ''}`);
    (sec.paragraphs || []).forEach(p => parts.push(p));
    (sec.bullets || []).forEach(b => parts.push('- ' + b));
  });
  return parts.join('\n\n').trim();
}

function renderSolutionsList() {
  const wrap = $('#solutionsList');
  if (!wrap) return;
  if (!STATE.solutions.length) {
    wrap.innerHTML = '<p class="hint">No suggestions generated yet — click "Generate suggestions" above.</p>';
    return;
  }
  wrap.innerHTML = STATE.solutions.map(s => {
    const sourceBadge = s.sourceType === 'kb' ? '<span class="solution-source-tag kb">From Previous Solutions</span>'
      : s.sourceType === 'websearch' ? '<span class="solution-source-tag web">From web search</span>'
      : '';
    return `
    <div class="solution-card ${s.status}">
      <div class="solution-card-head">
        <h4>${escapeHtml(s.name)} ${sourceBadge}</h4>
        ${s.status === 'accepted' ? '<span class="solution-status-tag accepted">Accepted ✓</span>' : ''}
        ${s.status === 'declined' ? '<span class="solution-status-tag declined">Declined</span>' : ''}
      </div>
      <p style="font-size:13px;margin:0 0 6px">${escapeHtml(s.description)}</p>
      <div class="solution-tools-row">${s.tools.map(t => `<span class="solution-tool-chip">${escapeHtml(t)}</span>`).join('')}</div>
      ${s.requirementsAddressed.length ? `<ul class="solution-reqs">${s.requirementsAddressed.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : ''}
      ${s.sourceNote ? `<p class="solution-source-note">Grounded in: ${escapeHtml(s.sourceNote)}</p>` : ''}
      <div class="add-row" style="margin:10px 0 0">
        <button class="btn small primary" data-act="accept-sol" data-id="${s.id}" ${s.status === 'accepted' ? 'disabled' : ''}>Accept</button>
        <button class="btn small secondary" data-act="decline-sol" data-id="${s.id}" ${s.status === 'declined' ? 'disabled' : ''}>Decline</button>
      </div>
    </div>
  `;
  }).join('');
  wrap.querySelectorAll('[data-act="accept-sol"]').forEach(b => b.addEventListener('click', () => onAcceptSolution(b.dataset.id)));
  wrap.querySelectorAll('[data-act="decline-sol"]').forEach(b => b.addEventListener('click', () => onDeclineSolution(b.dataset.id)));
}

function onAcceptSolution(id) {
  const sol = STATE.solutions.find(s => s.id === id);
  if (!sol) return;
  sol.status = 'accepted';
  let addedCount = 0;
  sol.tools.forEach(toolName => {
    const rec = findMasterToolMatch(toolName);
    if (rec && !rec.included) { rec.included = true; addedCount++; }
  });
  persist();
  renderSolutionsList();
  showToast(addedCount
    ? `"${sol.name}" accepted — ${addedCount} tool(s) auto-selected in Team & Tools (still editable there).`
    : `"${sol.name}" accepted.`);
}

function onDeclineSolution(id) {
  const sol = STATE.solutions.find(s => s.id === id);
  if (!sol) return;
  sol.status = 'declined';
  persist();
  renderSolutionsList();
}

async function generateProposalFlow(triggerBtn) {
  if (!chatReady()) {
    showToast('Set up a chat model (OpenRouter key, Ollama, or OmniRoute) in Setup first.', true);
    goToStep(1);
    return;
  }
  if (!STATE.drdText.trim()) {
    showToast('Create the Detailed Requirement Document in Step 2 first.', true);
    goToStep(2);
    return;
  }
  if (STATE.editedHtml && !window.confirm('Regenerating will discard your edits to the current draft. Continue?')) {
    return;
  }
  if (triggerBtn) triggerBtn.disabled = true;
  setToolbarBusy(true);
  setGenStatus('Reading the document and contacting ' + activeModel() + '...');
  try {
    const result = await generateFullProposal((delta, full) => setGenStatus(`Generating — ${full.length.toLocaleString()} characters so far...`));
    ['clientCompany', 'clientContact', 'clientIndustry', 'docNumber'].forEach(key => {
      const val = (result[key] || '').trim();
      if (val && !STATE.client[key].trim()) STATE.client[key] = val;
    });
    STATE.proposal = result;
    STATE.editedHtml = null; // fresh generation replaces any prior manual/AI edits
    persist();
    showToast('Proposal generated.');
    renderProposalPreview();
    setGenStatus('Generated just now.');
  } catch (e) {
    showToast('Generation failed: ' + e.message, true);
    console.error('Generation failed', e);
    setGenStatus('Error: ' + e.message);
  } finally {
    if (triggerBtn) triggerBtn.disabled = false;
    setToolbarBusy(false);
  }
}

function resetProposal() {
  if (!window.confirm('Reset the generated proposal? This clears the current draft and any edits. Your uploaded document, team, and tools stay as they are.')) return;
  STATE.proposal = null;
  STATE.editedHtml = null;
  persist();
  renderProposalPreview();
  showToast('Proposal reset.');
}

function renderProposalPreview() {
  const el = $('#proposalPreview');
  const p = STATE.proposal;
  const toolbar = $('#exportToolbar');
  const aiEditCard = $('#aiEditCard');
  const pdfHint = $('#pdfHint');
  const sectionBanner = $('#proposalSectionBanner');

  if (!p) {
    toolbar.style.display = 'none';
    if (aiEditCard) aiEditCard.style.display = 'none';
    if (pdfHint) pdfHint.style.display = 'none';
    if (sectionBanner) sectionBanner.style.display = 'none';
    el.innerHTML = ''; // nothing to show until "Generate Proposal" (in the toolbar-card above) has been used -- its own guard checks/toasts cover "not ready yet"
    return;
  }

  toolbar.style.display = 'flex';
  if (aiEditCard) aiEditCard.style.display = 'block';
  if (pdfHint) pdfHint.style.display = 'block';
  if (sectionBanner) sectionBanner.style.display = 'block';

  // If the user (or an AI edit) has already touched this document, that live
  // snapshot IS the document from here on — don't rebuild and lose edits.
  if (STATE.editedHtml) {
    el.innerHTML = STATE.editedHtml;
    makeEditable(el);
    return;
  }

  const c = STATE.client, s = STATE.settings;
  const costing = computeCosting();

  const metaRows = [
    ['Prepared for (contact)', c.clientContact || ''],
    ['Prepared for (company)', c.clientCompany || ''],
    ['Prepared by', s.providerName],
    ['Document No', c.docNumber || ''],
    ['Version', c.docVersion || 'V1.0'],
    ['Valid Until', new Date(Date.now() + (Number(s.validityDays) || 7) * 86400000).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })]
  ];

  let html = `
    ${logoRowHtml(c, s)}
    <table class="doc-header-band"><tr>
      <td class="doc-header-left"><b>PROPOSAL</b> &nbsp;|&nbsp; ${esc(c.clientCompany || '')}</td>
      <td class="doc-header-right">${esc(s.providerName)}</td>
    </tr></table>
    <h1 class="doc-title">${esc(p.docTitle)}</h1>
    <h2 class="doc-subtitle">${esc(p.docSubtitle)}</h2>
    <table class="meta-table">${metaRows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>

    <h3 class="sec">1. ${esc(p.section1_heading)}</h3>
    ${(p.section1_body || []).map(t => `<p class="editable">${esc(t)}</p>`).join('')}

    <h3 class="sec">2. ${esc(p.section2_heading)}</h3>
    <p class="editable">${esc(p.section2_intro)}</p>
    ${(p.subsections || []).map(sub => `
      <h4 class="subsec">${esc(sub.number)} ${esc(sub.heading)}</h4>
      ${(sub.body || []).map(t => `<p class="editable">${esc(t)}</p>`).join('')}
      ${sub.calloutHeading ? `<div class="callout"><b>${esc(sub.calloutHeading)}</b><span>${esc(sub.calloutBody)}</span></div>` : ''}
    `).join('')}

    <h3 class="sec">3. The Solution — What Gets Configured</h3>
    <p class="editable">${esc(p.section3_intro)}</p>
    <table class="data"><tr><th>What Gets Built</th><th>Configured Specifically</th></tr>
      ${(p.section3_rows || []).map(r => `<tr><td>${esc(r.item)}</td><td>${esc(r.detail)}</td></tr>`).join('')}
    </table>

    <h3 class="sec">4. How We Work Together</h3>
    <p class="editable">${esc(p.section4_intro)}</p>
    <table class="data"><tr><th>Stage</th><th>Timeline</th><th>What Happens</th></tr>
      <tr><td>Stage 1 — Solution Mapping &amp; Blueprint</td><td>2-3 Days</td><td>Requirements reviewed and mapped into a blueprint; SOW signed before configuration begins.</td></tr>
      <tr><td>Stage 2 — Implementation</td><td>Per plan</td><td>The system is built to the agreed blueprint and the team is trained.</td></tr>
      <tr><td>Stage 3 — Go-Live &amp; Handover</td><td>Included</td><td>UAT sign-off, final training, and handover.</td></tr>
      <tr><td>Stage 4 — Hypercare</td><td>Per plan</td><td>Active post-go-live stabilisation support.</td></tr>
    </table>

    <h3 class="sec">5. Investment Overview</h3>
    <p>All figures exclude GST at ${costing.gstPct}%.</p>
    ${costing.tools.length ? `
      <h4 class="subsec">Zoho Tools &amp; Licences</h4>
      <table class="data"><tr><th>Tool</th><th>Edition</th><th>Qty</th><th>Cycle</th><th>Line Cost</th></tr>
        ${costing.tools.map(t => `<tr><td>${esc(t.tool)}</td><td>${esc(t.edition)}</td><td>${t.qty}</td><td>${t.cycle}</td><td>${fmtMoney(toolLineCost(t))}</td></tr>`).join('')}
      </table>
      <p><b>Annualised licence total: ${fmtMoney(costing.licenceAnnualTotal)}</b></p>
    ` : ''}
    ${costing.team.length ? `
      <h4 class="subsec">Implementation Investment</h4>
      <table class="data"><tr><th>Engagement Stage</th><th>Investment (excl. GST)</th></tr>
        <tr><td>Solution Mapping &amp; Blueprint</td><td>${fmtMoney(costing.stages.mapping)}</td></tr>
        <tr><td>Phase 1 Implementation</td><td>${fmtMoney(costing.stages.implementation)}</td></tr>
        <tr><td>Post Go-Live Hypercare</td><td>${fmtMoney(costing.stages.hypercare)}</td></tr>
        <tr><td><b>Total Implementation Investment (excl. GST)</b></td><td><b>${fmtMoney(costing.implementationTotal)}</b></td></tr>
      </table>
      <p><b>GST @ ${costing.gstPct}%: ${fmtMoney(costing.gstAmount)} | Total incl. GST: ${fmtMoney(costing.implementationWithGst)}</b></p>
      <h4 class="subsec">Payment Schedule — Milestone-Based</h4>
      <table class="data"><tr><th>Milestone</th><th>Amount</th></tr>
        <tr><td>On proposal acceptance (${s.pctAdvance}% of Solution Mapping fee)</td><td>${fmtMoney(costing.payment.advance)}</td></tr>
        <tr><td>On SOW sign-off (${s.pctSignoff}% of Implementation + Hypercare)</td><td>${fmtMoney(costing.payment.signoff)}</td></tr>
        <tr><td>On go-live &amp; handover (${s.pctGolive}% of Implementation + Hypercare)</td><td>${fmtMoney(costing.payment.golive)}</td></tr>
      </table>
    ` : '<p><i>No team hours or tools were allocated in Step 3 — Investment section is empty.</i></p>'}

    <h3 class="sec">6. Key Notes</h3>
    ${(p.section6_notes || []).map((n, i) => `<p class="editable">${i + 1}. ${esc(n)}</p>`).join('')}

    <h3 class="sec">7. About ${esc(s.providerName)}</h3>
    <p class="editable">${esc(s.providerAbout)}</p>

    <h3 class="sec">8. ${esc(p.section8_heading)}</h3>
    ${(p.section8_body || []).map(t => `<p class="editable">${esc(t)}</p>`).join('')}
    ${p.promiseHeading ? `<div class="callout orange"><b>${esc(p.promiseHeading)}</b><span>${esc(p.promiseBody)}</span></div>` : ''}

    <table class="doc-footer-band"><tr>
      <td>${esc(s.providerTagline)}</td>
      <td class="doc-footer-right">${esc(c.docNumber || '')}</td>
    </tr></table>
  `;
  el.innerHTML = html;
  makeEditable(el);
}

function stripContentEditable(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
  return tmp.innerHTML;
}

async function applyAiEditFlow() {
  const input = $('#aiEditInput');
  const instruction = input.value.trim();
  if (!instruction) { showToast('Type an instruction first.', true); return; }
  if (!chatReady()) { showToast('Set up a chat model (OpenRouter key, Ollama, or OmniRoute) in Setup first.', true); goToStep(1); return; }
  const el = $('#proposalPreview');
  const btn = $('#aiEditBtn');
  btn.disabled = true;
  setToolbarBusy(true);
  setGenStatus('Applying AI edit...');
  try {
    const cleanHtml = stripContentEditable(el.innerHTML);
    const newHtml = await applyAiEdit(cleanHtml, instruction, (delta, full) => setGenStatus(`Applying AI edit — ${full.length.toLocaleString()} characters so far...`));
    el.innerHTML = newHtml;
    makeEditable(el);
    STATE.editedHtml = el.innerHTML;
    persist();
    input.value = '';
    showToast('AI edit applied.');
    setGenStatus('Edited just now.');
  } catch (e) {
    showToast('AI edit failed: ' + e.message, true);
    console.error('AI edit failed', e);
    setGenStatus('Error: ' + e.message);
  } finally {
    btn.disabled = false;
    setToolbarBusy(false);
  }
}

/* ---------- Step 5: Knowledge Base (Zoho priced editions + RAG docs) ---------- */
function renderKnowledgeBase() {
  renderAdminToolsTable(); // the master pricing/edition CRUD table lives here, in Knowledge Base
  renderDomainsManageList();
  kbPopulateUploadSectionSelect();
  kbRenderSectionsManageList();
  kbRenderDocuments();
  kbCheckHealth();
  kbRenderCollections();
}

function wireKnowledgeBase() {
  const domainSelect = $('#adminNewToolDomain');
  if (domainSelect) domainSelect.innerHTML = domainOptionsHtml('');
  refreshAdminToolDatalists();
  renderDomainsManageList();
  $('#adminAddToolBtn').addEventListener('click', onAdminAddTool);
  $('#adminToolsSearch').addEventListener('input', renderAdminToolsTable);
  $('#adminToolsSortBtn').addEventListener('click', () => {
    sortMasterToolsAlpha();
    renderAdminToolsTable();
    showToast('Tools arranged A–Z.');
  });

  const addEditToggle = $('#toolsAddEditToggle');
  const addEditPanel = $('#toolsAddEditPanel');
  if (addEditToggle && addEditPanel) {
    addEditToggle.addEventListener('click', () => {
      const nowHidden = addEditPanel.classList.toggle('hidden');
      addEditToggle.textContent = nowHidden ? '+ Add / Edit tool ▾' : '+ Add / Edit tool ▴';
    });
  }
  const domainsToggle = $('#domainsManageToggle');
  const domainsPanel = $('#domainsManagePanel');
  if (domainsToggle && domainsPanel) {
    domainsToggle.addEventListener('click', () => {
      const nowHidden = domainsPanel.classList.toggle('hidden');
      domainsToggle.textContent = nowHidden ? 'Manage domains ▾' : 'Manage domains ▴';
    });
  }

  $('#adminNewDomainBtn').addEventListener('click', () => {
    const name = window.prompt('New domain name (e.g. "Custom Integrations"):');
    if (!name || !name.trim()) return;
    const added = addCustomDomain(name);
    if (!added) return;
    $('#adminNewToolDomain').innerHTML = domainOptionsHtml(added);
    renderDomainsManageList();
    showToast(`Domain "${added}" added.`);
  });

  wireKnowledgeBaseUpload();
}

// Only custom domains are listed/removable here -- Zoho's own 13 are real
// product categories (assets/zohoToolkit.js), not something to delete.
function renderDomainsManageList() {
  const wrap = $('#domainsManageList');
  if (!wrap) return;
  if (!CUSTOM_DOMAINS.length) {
    wrap.innerHTML = '<p class="hint">No domains yet — use "+ New domain" above to add one.</p>';
    return;
  }
  wrap.innerHTML = CUSTOM_DOMAINS.map(d => `
    <div class="ai-history-row" style="cursor:default">
      <span class="ai-history-row-title">${escapeHtml(formatDomainLabel(d))}</span>
      <button class="btn small secondary" data-remove-domain="${escapeAttr(d)}">Remove</button>
    </div>
  `).join('');
  wrap.querySelectorAll('[data-remove-domain]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.removeDomain;
      removeCustomDomain(name);
      $('#adminNewToolDomain').innerHTML = domainOptionsHtml('');
      renderDomainsManageList();
      renderAdminToolsTable(); // any tool still using the removed domain keeps its value on the record, just won't offer it as a dropdown choice going forward
      showToast(`Domain "${formatDomainLabel(name)}" removed.`);
    });
  });
}

// Keeps the Tool/Edition combo-input suggestions current -- called on init
// and again every time the table re-renders, so a tool added a moment ago
// is immediately suggestible for its next edition tier.
function refreshAdminToolDatalists() {
  const toolNames = Array.from(new Set(MASTER_TOOLS.map(t => t.tool).filter(Boolean))).sort();
  const editions = Array.from(new Set(MASTER_TOOLS.map(t => t.edition).filter(Boolean))).sort();
  const namesList = $('#adminToolNamesList');
  const editionsList = $('#adminToolEditionsList');
  if (namesList) namesList.innerHTML = toolNames.map(n => `<option value="${escapeAttr(n)}">`).join('');
  if (editionsList) editionsList.innerHTML = editions.map(n => `<option value="${escapeAttr(n)}">`).join('');
}

/* ---------- DRD (Detailed Requirement Document) flow ----------
   Skips Domain/Tools, the checklist, and missed-questions entirely (see
   updateDocTypeUI) -- this is the review/edit/generate flow for step 4
   once a DRD has been uploaded. "Generate Proposal" reuses the existing
   generateProposalFlow()/proposalPreview machinery completely unchanged
   (it only ever depended on STATE.prelimText); "Generate Scope of Work"
   is new, using its own simpler HTML-fragment generation and a parallel
   preview/edit/export area (#sowPreview) built the same way. */

// Converts the plain extracted text into simple editable paragraph HTML
// for #drdPreview, and the reverse for syncing edits back to
// STATE.prelimText (what generation actually reads) -- so the two never
// drift out of sync regardless of which one was just edited.
function textToEditableHtml(text) {
  const blocks = (text || '').split(/\n{2,}/);
  return blocks.map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('') || '<p></p>';
}
function editableHtmlToText(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const paragraphs = Array.from(tmp.querySelectorAll('p')).map(p => p.innerText.trim());
  return (paragraphs.length ? paragraphs.join('\n\n') : tmp.innerText).trim();
}

function renderDrdPreview() {
  const el = $('#drdPreview');
  if (!el) return;
  // Prefer the formatted document (structured DRD rendered through
  // buildDrdHtml); fall back to plain paragraphs for a directly-entered
  // DRD that hasn't been through generation yet.
  el.innerHTML = STATE.drdHtml || textToEditableHtml(STATE.drdText);
  makeEditable(el);
}

// Called from updateDocTypeUI() and goToStep(2) -- shows/hides the unified
// DRD review block and keeps its editable text current with whatever's in
// STATE.drdText, regardless of whether that came from direct DRD entry or
// AI generation from a preliminary document.
function renderDrdReviewSection() {
  const section = $('#drdReviewSection');
  const hasDrd = !!(STATE.drdText && STATE.drdText.trim());
  if (section) section.style.display = hasDrd ? 'block' : 'none';
  if (hasDrd) { renderDrdPreview(); renderSolutionsList(); }
}

let drdSaveTimer;
function wireDrdLiveEditCapture() {
  const el = $('#drdPreview');
  if (!el) return;
  el.addEventListener('input', () => {
    clearTimeout(drdSaveTimer);
    drdSaveTimer = setTimeout(() => {
      // Keep both forms in sync: the rendered HTML is what's shown/exported,
      // the plain text is what downstream Proposal/SOW generation reads.
      if (STATE.drdHtml) {
        STATE.drdHtml = el.innerHTML;
        STATE.drdText = el.innerText.trim();
      } else {
        STATE.drdText = editableHtmlToText(el.innerHTML);
      }
      persist();
    }, 500);
  });
}

async function applyDrdAiEditFlow() {
  const input = $('#drdAiEditInput');
  const instruction = input.value.trim();
  if (!instruction) { showToast('Type an instruction first.', true); return; }
  if (!chatReady()) { showToast('Set up a chat model (OpenRouter key, Ollama, or OmniRoute) in Setup first.', true); goToStep(1); return; }
  const el = $('#drdPreview');
  const btn = $('#drdAiEditBtn');
  const status = $('#drdProceedStatus');
  btn.disabled = true;
  if (status) status.textContent = 'Applying AI edit...';
  try {
    const cleanHtml = stripContentEditable(el.innerHTML);
    const newHtml = await applyAiEdit(cleanHtml, instruction, (delta, full) => {
      if (status) status.textContent = `Applying AI edit — ${full.length.toLocaleString()} characters so far...`;
    });
    el.innerHTML = newHtml;
    makeEditable(el);
    if (STATE.drdHtml) {
      STATE.drdHtml = newHtml;
      STATE.drdText = el.innerText.trim();
    } else {
      STATE.drdText = editableHtmlToText(newHtml);
    }
    persist();
    input.value = '';
    showToast('AI edit applied.');
    if (status) status.textContent = 'Edited just now.';
  } catch (e) {
    showToast('AI edit failed: ' + e.message, true);
    console.error('DRD AI edit failed', e);
    if (status) status.textContent = 'Error: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

async function generateSowFlow(triggerBtn) {
  if (!chatReady()) { showToast('Set up a chat model (OpenRouter key, Ollama, or OmniRoute) in Setup first.', true); goToStep(1); return; }
  if (!STATE.drdText.trim()) { showToast('Create the Detailed Requirement Document in Step 2 first.', true); goToStep(2); return; }
  if (STATE.sowHtml && !window.confirm('Regenerating will discard your edits to the current Scope of Work draft. Continue?')) return;
  if (triggerBtn) triggerBtn.disabled = true;
  const status = $('#drdGenStatus');
  if (status) status.textContent = 'Reading the document and contacting ' + activeModel() + '...';
  try {
    const sow = await generateScopeOfWork(STATE.drdText, (delta, full) => {
      if (status) status.textContent = `Generating Scope of Work — ${full.length.toLocaleString()} characters so far...`;
    });
    // Fill shared client fields only if still empty -- same non-destructive
    // pattern the Proposal uses, so whichever of the two is generated
    // first supplies these for the other.
    ['clientCompany', 'clientContact'].forEach(key => {
      const val = (sow[key] || '').trim();
      if (val && !STATE.client[key].trim()) STATE.client[key] = val;
    });
    STATE.sow = sow; // kept alongside the rendered HTML so "Regenerate" and future re-renders don't need the AI again for formatting-only tweaks
    STATE.sowHtml = buildSowHtml(sow);
    persist();
    showToast('Scope of Work generated.');
    renderSowPreview();
    if (status) status.textContent = 'Scope of Work generated just now.';
  } catch (e) {
    showToast('Generation failed: ' + e.message, true);
    console.error('SOW generation failed', e);
    if (status) status.textContent = 'Error: ' + e.message;
  } finally {
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

// Deterministic HTML template for the Scope of Work, mirroring the
// Proposal's own template (assets/main.js: renderProposalPreview) exactly
// -- same CSS classes (doc-title/doc-subtitle/meta-table/sec/subsec/data/
// callout), same Investment block (reusing computeCosting() rather than
// letting the AI state pricing), so both documents look, edit, and export
// consistently. Structure matches the real reference SOW format: title
// page, Purpose, a lettered/numbered Scope of Work table, numbered
// Exclusions and Client Dependencies subsections, Investment, Timeline,
// Notes, Conclusion, and an Acceptance/signature block.
// Shared logo row for both document templates. Emits explicit width/height
// attributes (not just CSS) because Word's HTML renderer ignores CSS
// max-width/max-height on images -- without these the logos render at full
// natural size in the .doc export.
function logoRowHtml(c, s) {
  const companyUri = activeCompanyLogo();
  const companySize = activeCompanyLogoSize();
  const companyFit = logoDisplaySize(companySize.width, companySize.height, 120, 78);
  const clientFit = logoDisplaySize(c.clientLogoW, c.clientLogoH, 120, 78);
  // Word's HTML-import path doesn't reliably treat bare width/height
  // attributes as browser-style 96dpi pixels -- the same pixel values that
  // render correctly on screen and in the PDF export came out oversized in
  // Word. An explicit inline style with point units is what Word's
  // importer actually respects. The px attributes stay too (harmless in
  // Word, and the PDF exporter reads them directly as px).
  const dimAttrs = fit => {
    const wPt = Math.round(fit.width * 0.75); // 96dpi px -> 72dpi pt
    const hPt = fit.height ? Math.round(fit.height * 0.75) : null;
    return `width="${fit.width}"${fit.height ? ` height="${fit.height}"` : ''} style="width:${wPt}pt;${hPt ? `height:${hPt}pt;` : ''}max-width:${wPt}pt"`;
  };
  return `
    <table class="doc-logo-row"><tr>
      <td class="doc-logo-left">${c.clientLogo ? `<img class="doc-logo" src="${c.clientLogo}" ${dimAttrs(clientFit)} alt="Client logo">` : ''}</td>
      <td class="doc-logo-right"><img class="doc-logo" src="${companyUri}" ${dimAttrs(companyFit)} alt="${esc(s.providerName)}"></td>
    </tr></table>`;
}

function buildSowHtml(sow) {
  const c = STATE.client, s = STATE.settings;
  const costing = computeCosting();
  const clientName = c.clientCompany || sow.clientCompany || '';
  // Same tagline as the Proposal's title page when one exists, so the two
  // documents visually match; falls back to the SOW's own generated one.
  const tagline = (STATE.proposal && STATE.proposal.docSubtitle) || sow.docTagline || '';
  const proposalRef = STATE.proposal ? `${c.docNumber || ''} ${c.docVersion || 'V1.0'}`.trim() : '';

  const metaRows = [
    ['Document No', sow.docNumber || ''],
    ['Version', 'V1.0'],
    ['Client', clientName],
    ['Primary Contact', c.clientContact || sow.clientContact || ''],
    ['Submitted by', s.providerName],
    ['Date', new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })],
    ['Reference Proposal', proposalRef]
  ];

  const investmentHtml = (costing.tools.length || costing.team.length) ? `
    ${costing.tools.length ? `
      <h4 class="subsec">Zoho Tools &amp; Licences</h4>
      <table class="data"><tr><th>Tool</th><th>Edition</th><th>Qty</th><th>Cycle</th><th>Line Cost</th></tr>
        ${costing.tools.map(t => `<tr><td>${esc(t.tool)}</td><td>${esc(t.edition)}</td><td>${t.qty}</td><td>${t.cycle}</td><td>${fmtMoney(toolLineCost(t))}</td></tr>`).join('')}
      </table>
      <p><b>Annualised licence total: ${fmtMoney(costing.licenceAnnualTotal)}</b></p>
    ` : ''}
    ${costing.team.length ? `
      <h4 class="subsec">Implementation Investment</h4>
      <table class="data"><tr><th>Engagement Stage</th><th>Investment (excl. GST)</th></tr>
        <tr><td>Solution Mapping &amp; Blueprint</td><td>${fmtMoney(costing.stages.mapping)}</td></tr>
        <tr><td>Phase 1 Implementation</td><td>${fmtMoney(costing.stages.implementation)}</td></tr>
        <tr><td>Post Go-Live Hypercare</td><td>${fmtMoney(costing.stages.hypercare)}</td></tr>
        <tr><td><b>Total Implementation Investment (excl. GST)</b></td><td><b>${fmtMoney(costing.implementationTotal)}</b></td></tr>
      </table>
      <p><b>GST @ ${costing.gstPct}%: ${fmtMoney(costing.gstAmount)} | Total incl. GST: ${fmtMoney(costing.implementationWithGst)}</b></p>
      <h4 class="subsec">Payment Schedule — Milestone-Based</h4>
      <table class="data"><tr><th>Milestone</th><th>Amount</th></tr>
        <tr><td>On proposal acceptance (${s.pctAdvance}% of Solution Mapping fee)</td><td>${fmtMoney(costing.payment.advance)}</td></tr>
        <tr><td>On SOW sign-off (${s.pctSignoff}% of Implementation + Hypercare)</td><td>${fmtMoney(costing.payment.signoff)}</td></tr>
        <tr><td>On go-live &amp; handover (${s.pctGolive}% of Implementation + Hypercare)</td><td>${fmtMoney(costing.payment.golive)}</td></tr>
      </table>
    ` : ''}
  ` : '<p><i>No team hours or tools were allocated in Step 3 — Investment section is empty.</i></p>';

  return `
    ${logoRowHtml(c, s)}
    <table class="doc-header-band"><tr>
      <td class="doc-header-left"><b>SCOPE OF WORK</b> &nbsp;|&nbsp; ${esc(clientName)}</td>
      <td class="doc-header-right">${esc(s.providerName)}</td>
    </tr></table>
    <h1 class="doc-title">SCOPE OF WORK</h1>
    <h2 class="doc-subtitle">${esc(clientName)}</h2>
    ${tagline ? `<p class="editable" style="margin-top:-16px;color:var(--muted,#6b7280);font-size:13px">${esc(tagline)}</p>` : ''}
    <table class="meta-table">${metaRows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <div class="callout"><span><i>${esc(sow.introBody || '')}</i></span></div>

    <h3 class="sec">1. Purpose</h3>
    ${(sow.purposeBody || []).map(t => `<p class="editable">${esc(t)}</p>`).join('')}
    ${(sow.sourceDocuments || []).length ? `<p class="editable">This SOW is based on the findings from the following documents:</p><ul>${sow.sourceDocuments.map(d => `<li class="editable">${esc(d)}</li>`).join('')}</ul>` : ''}

    <h3 class="sec">2. Scope of Work</h3>
    <p class="editable">The table below lists all deliverables that ${esc(s.providerName)} will perform under this engagement.</p>
    ${(sow.scopeGroups || []).map(g => `
      <table class="group-header"><tr><td>${esc(g.letter)}. ${esc(g.heading)}</td></tr></table>
      <table class="items">
        ${(g.items || []).map((item, i) => `<tr><td>${i + 1}</td><td class="editable">${esc(item)}</td></tr>`).join('')}
      </table>
    `).join('')}

    <h3 class="sec">3. Exclusions</h3>
    <p class="editable">The following are explicitly outside the scope of this engagement. Any of these can be scoped and proposed separately as a future phase.</p>
    ${(sow.exclusions || []).map(ex => `
      <h4 class="subsec">${esc(ex.number)} ${esc(ex.heading)}</h4>
      <ul>${(ex.items || []).map(i => `<li class="editable">${esc(i)}</li>`).join('')}</ul>
    `).join('')}

    <h3 class="sec">4. Client Dependencies</h3>
    ${(sow.dependencies || []).map(dep => `
      <h4 class="subsec">${esc(dep.number)} ${esc(dep.heading)}</h4>
      <ul>${(dep.items || []).map(i => `<li class="editable">${esc(i)}</li>`).join('')}</ul>
    `).join('')}

    <h3 class="sec">5. Investment</h3>
    <p>All figures exclude GST at ${costing.gstPct}%.</p>
    ${investmentHtml}

    <h3 class="sec">6. Timeline</h3>
    <table class="data"><tr><th>Stage</th><th>Activities</th></tr>
      ${(sow.timelineStages || []).map(t => `<tr><td>${esc(t.name)}</td><td class="editable">${esc(t.activities)}</td></tr>`).join('')}
    </table>

    <h3 class="sec">7. Notes</h3>
    ${(sow.notes || []).length
      ? sow.notes.map((n, i) => `<p class="editable">${i + 1}. ${esc(n)}</p>`).join('')
      : '<p class="editable"><i>No notes generated — click here to add any.</i></p>'}

    <h3 class="sec">8. Conclusion</h3>
    ${(sow.conclusionBody || []).length
      ? sow.conclusionBody.map(t => `<p class="editable">${esc(t)}</p>`).join('')
      : '<p class="editable"><i>No conclusion generated — click here to write one, or use "Regenerate" above.</i></p>'}

    <h3 class="sec">9. Acceptance</h3>
    <p class="editable">By signing below, ${esc(clientName || 'the client')} confirms agreement with the scope, exclusions, client dependencies, investment, and timeline defined in this document.</p>
    <table class="meta-table"><tr><td class="k">For ${esc(clientName)}</td><td>Date: ____________________</td></tr></table>

    <table class="doc-footer-band"><tr>
      <td>${esc(s.providerTagline)}</td>
      <td class="doc-footer-right">${esc(sow.docNumber || '')}</td>
    </tr></table>
  `;
}

function renderSowPreview() {
  const wrap = $('#sowSection');
  const el = $('#sowPreview');
  const toolbar = $('#sowExportToolbar');
  const aiEditCard = $('#sowAiEditCard');
  if (!wrap || !el) return;
  if (!STATE.sowHtml) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  if (toolbar) toolbar.style.display = 'flex';
  if (aiEditCard) aiEditCard.style.display = 'block';
  el.innerHTML = STATE.sowHtml;
  makeEditable(el);
}

function wireSowLiveEditCapture() {
  const el = $('#sowPreview');
  if (!el) return;
  let saveTimer;
  el.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      STATE.sowHtml = el.innerHTML;
      persist();
    }, 500);
  });
}

async function applySowAiEditFlow() {
  const input = $('#sowAiEditInput');
  const instruction = input.value.trim();
  if (!instruction) { showToast('Type an instruction first.', true); return; }
  if (!chatReady()) { showToast('Set up a chat model (OpenRouter key, Ollama, or OmniRoute) in Setup first.', true); goToStep(1); return; }
  const el = $('#sowPreview');
  const btn = $('#sowAiEditBtn');
  const status = $('#sowExportStatus');
  btn.disabled = true;
  if (status) status.textContent = 'Applying AI edit...';
  try {
    const cleanHtml = stripContentEditable(el.innerHTML);
    const newHtml = await applyAiEdit(cleanHtml, instruction, (delta, full) => {
      if (status) status.textContent = `Applying AI edit — ${full.length.toLocaleString()} characters so far...`;
    });
    el.innerHTML = newHtml;
    makeEditable(el);
    STATE.sowHtml = newHtml;
    persist();
    input.value = '';
    showToast('AI edit applied.');
    if (status) status.textContent = 'Edited just now.';
  } catch (e) {
    showToast('AI edit failed: ' + e.message, true);
    console.error('SOW AI edit failed', e);
    if (status) status.textContent = 'Error: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

function renderClientLogoBox() {
  const box = $('#clientLogoPreviewBox');
  const hint = $('#clientLogoEmptyHint');
  const replaceBtn = $('#clientLogoReplaceBtn');
  const removeBtn = $('#clientLogoRemoveBtn');
  const hasLogo = !!STATE.client.clientLogo;
  if (box) box.style.display = hasLogo ? 'flex' : 'none';
  if (hint) hint.style.display = hasLogo ? 'none' : 'block';
  if (replaceBtn) replaceBtn.style.display = hasLogo ? 'inline-flex' : 'none';
  if (removeBtn) removeBtn.style.display = hasLogo ? 'inline-flex' : 'none';
  if (hasLogo) $('#clientLogoPreview').src = STATE.client.clientLogo;
}

function wireClientLogoUpload() {
  $('#clientLogoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const fitted = await autoFitImageToDataUri(file, 340, 220);
      STATE.client.clientLogo = fitted.dataUri;
      STATE.client.clientLogoW = fitted.width;
      STATE.client.clientLogoH = fitted.height;
      persist();
      renderClientLogoBox();
      renderProposalPreview();
      renderSowPreview();
      showToast('Client logo added.');
    } catch (err) {
      showToast('Could not process that image: ' + err.message, true);
      console.error('Client logo upload failed', err);
    }
  });
  $('#clientLogoReplaceBtn').addEventListener('click', () => $('#clientLogoInput').click());
  $('#clientLogoRemoveBtn').addEventListener('click', () => {
    STATE.client.clientLogo = '';
    STATE.client.clientLogoW = null;
    STATE.client.clientLogoH = null;
    persist();
    $('#clientLogoInput').value = '';
    renderClientLogoBox();
    renderProposalPreview();
    renderSowPreview();
    showToast('Client logo removed.');
  });
}

function renderReviewStep() {
  const drdEl = $('#drdReviewPreview');
  if (drdEl) drdEl.textContent = STATE.drdText.trim() || 'No Detailed Requirement Document yet — go to the Document step to create or enter one.';

  renderClientLogoBox();

  const summaryEl = $('#teamToolsReviewSummary');
  if (summaryEl) {
    const costing = computeCosting();
    if (!costing.team.length && !costing.tools.length) {
      summaryEl.innerHTML = '<p class="hint">No team members or tools added yet — go to the Team &amp; Tools step.</p>';
    } else {
      summaryEl.innerHTML = `
        <p class="hint">${costing.team.length} team member(s) · ${costing.tools.length} tool line(s) · Implementation total ${fmtMoney(costing.implementationTotal)} (excl. GST)</p>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Role</th><th>Total hrs</th></tr></thead><tbody>
          ${costing.team.map(m => `<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.role || '—')}</td><td>${(Number(m.hoursMapping) || 0) + (Number(m.hoursImplementation) || 0) + (Number(m.hoursHypercare) || 0)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Tool</th><th>Edition</th><th>Qty</th><th>Cycle</th></tr></thead><tbody>
          ${costing.tools.map(t => `<tr><td>${escapeHtml(t.tool)}</td><td>${escapeHtml(t.edition)}</td><td>${t.qty}</td><td>${t.cycle}</td></tr>`).join('')}
        </tbody></table></div>`;
    }
  }
}

function wireDrdAndSow() {
  $('#drdAiEditBtn').addEventListener('click', applyDrdAiEditFlow);
  $('#drdAiEditInput').addEventListener('keydown', e => { if (e.key === 'Enter') applyDrdAiEditFlow(); });
  $('#drdGenProposalBtn').addEventListener('click', (e) => generateProposalFlow(e.target));
  $('#drdGenSowBtn').addEventListener('click', (e) => generateSowFlow(e.target));
  $('#reviewSaveForLaterBtn').addEventListener('click', saveForLater);
  $('#drdSaveForLaterBtn').addEventListener('click', saveForLater);
  $('#drdProceedToTeamBtn').addEventListener('click', () => {
    if (!STATE.drdText.trim()) { showToast('Create or enter the Detailed Requirement Document first.', true); return; }
    goToStep('3');
  });
  wireDrdLiveEditCapture();

  $('#proceedToGenerateBtn').addEventListener('click', () => {
    if (!STATE.drdText.trim()) { showToast('Create or enter the Detailed Requirement Document in Step 2 first.', true); goToStep(2); return; }
    goToStep('4');
  });
  $('#reviewEditDrdBtn').addEventListener('click', () => goToStep(2));
  $('#reviewEditTeamBtn').addEventListener('click', () => goToStep(3));

  $('#sowAiEditBtn').addEventListener('click', applySowAiEditFlow);
  $('#sowAiEditInput').addEventListener('keydown', e => { if (e.key === 'Enter') applySowAiEditFlow(); });
  $('#sowRegenBtn').addEventListener('click', (e) => generateSowFlow(e.target));
  wireSowLiveEditCapture();
  $('#sowDownloadBtn').addEventListener('click', async (e) => {
    const format = $('#sowExportFormat').value;
    const btn = e.target;
    btn.disabled = true;
    const status = $('#sowExportStatus');
    if (status) status.textContent = 'Building ' + (format === 'pdf' ? 'PDF' : 'Word document') + '...';
    try {
      if (format === 'pdf') {
        await buildPdfAndDownload('sowPreview', 'Scope of Work', 'Scope_of_Work');
      } else {
        await buildDocxAndDownload('sowPreview', 'Scope of Work', 'Scope_of_Work');
      }
      if (status) status.textContent = 'Downloaded.';
    } catch (e2) {
      showToast('Export failed: ' + e2.message, true);
      console.error('SOW export failed', e2);
      if (status) status.textContent = 'Export failed: ' + e2.message;
    } finally {
      btn.disabled = false;
    }
  });
}

function wireExport() {
  $('#regenBtn').addEventListener('click', (e) => generateProposalFlow(e.target));
  $('#resetBtn').addEventListener('click', resetProposal);
  $('#aiEditBtn').addEventListener('click', applyAiEditFlow);
  $('#aiEditInput').addEventListener('keydown', e => { if (e.key === 'Enter') applyAiEditFlow(); });
  wireLiveEditCapture();
  $('#downloadBtn').addEventListener('click', async (e) => {
    const format = $('#exportFormat').value;
    const btn = e.target;
    btn.disabled = true;
    setGenStatus('Building ' + (format === 'pdf' ? 'PDF' : 'Word document') + '...');
    try {
      if (format === 'pdf') {
        await buildPdfAndDownload();
      } else {
        await buildDocxAndDownload();
      }
      setGenStatus('Downloaded.');
    } catch (e2) {
      showToast('Export failed: ' + e2.message, true);
      console.error('Export failed', e2);
      setGenStatus('Export failed: ' + e2.message);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- utils ---------- */
function esc(v) { return escapeHtml(v == null ? '' : String(v)); }
function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
function escapeAttr(str) { return escapeHtml(str); }

// Every hardcoded "15" in the UI (headings, hints, confirm dialogs) reads
// from here instead, so changing the criteria count in Admin propagates
// everywhere automatically -- nowhere else should hardcode the number.
function refreshCriteriaCounts() {
  const n = STATE.checklist.length;
  $all('.crit-count').forEach(el => { el.textContent = String(n); });
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  try {
    wireNav();
    wireSetup();
    wireDocumentStep();
    wireTeamTools();
    wireExport();
    wireDrdAndSow();
    wireClientLogoUpload();
    wireKnowledgeBase();
    wireAdmin();
    wireAskAi();
    wirePendingFilters();
    wireStepNavArrows();
    $('#teamToolsSaveForLaterBtn').addEventListener('click', saveForLater);
    refreshCriteriaCounts();
    updatePendingBadge(loadPendingSessions().length);
    goToStep(1);
  } catch (e) {
    console.error('Startup error — the app failed to initialize:', e);
    showToast('Startup error: ' + e.message + ' (see browser console for details)', true);
  }
});
