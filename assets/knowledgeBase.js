/* Talks to the local server/ Knowledge Base API (Express + Qdrant) so
   .md/.txt/.json files can be uploaded, chunked, and embedded via the
   configured embedding provider (OpenRouter or a local Ollama model, see
   assets/state.js: activeEmbedModel()/isOllamaEmbed(), set in Setup), and
   searched by the "Ask AI" bubble (see
   assets/askAi.js). */

const KB_API_BASE = 'http://localhost:5001';
let kbLastKnownDocCount = null; // set by kbRenderDocuments(); used by main.js: updateStepReadiness() to avoid an async fetch on every check

/* Used by the Domain/Tools "Send to AI" check (main.js: runSendToAi) to
   ground tool-fit verdicts in whatever's actually in the Knowledge Base --
   any uploaded document that's semantically relevant to a selected tool,
   not just a file named exactly tools.json/tools.md (that was too strict:
   a real reference upload like "final_tool_description.md" was invisible
   to this check purely because of its filename). Fails soft — returns
   null (not an error) if the KB server is offline or nothing relevant is
   found, so the checklist analysis still runs normally without it.

   Uses semantic search (top few chunks per selected tool, across every
   active Qdrant collection) rather than dumping whole files: cheaper,
   more relevant, and avoids derailing JSON output with irrelevant
   sections. Each result keeps track of which file it actually came from,
   so the AI prompt can cite real filenames rather than one assumed name. */
/* Used by Solution Suggestions (main.js: runGenerateSolutions) to ground
   candidate solutions in real past work rather than generic reasoning --
   finds every Knowledge Base document filed under the "Previous
   Solutions" section, then semantically searches each one using the DRD
   text as the query. Fails soft (returns null) if the KB is offline or
   nothing's filed there yet -- Solution Suggestions still works without
   it, just leans more on the priced tools list instead. */
async function kbFetchPreviousSolutionsContext(drdText) {
  try {
    if (!embedReady() || !drdText || !drdText.trim()) return null;
    const listRes = await fetch(KB_API_BASE + '/api/kb/documents');
    if (!listRes.ok) return null;
    const listData = await listRes.json();
    const docs = (listData.documents || []).filter(d => d.section === 'Previous Solutions');
    if (!docs.length) return null;

    const seen = new Set();
    const parts = []; // [{ text, source }]
    const searches = await Promise.all(docs.map(d =>
      fetch(KB_API_BASE + '/api/kb/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: drdText.slice(0, 2000),
          apiKey: STATE.settings.apiKey,
          embedModel: activeEmbedModel(),
          embedProvider: STATE.settings.embedProvider,
          ollamaUrl: STATE.settings.ollamaUrl,
          customApiUrl: STATE.settings.customApiUrl,
          customApiKey: STATE.settings.customApiKey,
          nvidiaApiKey: STATE.settings.nvidiaApiKey,
          source: d.source,
          topK: 4
        })
      }).then(res => res.ok ? res.json() : { chunks: [] }).catch(() => ({ chunks: [] }))
    ));
    searches.forEach(data => {
      (data.chunks || []).forEach(c => {
        const key = c.text.slice(0, 60);
        if (!seen.has(key)) { seen.add(key); parts.push({ text: c.text, source: c.source }); }
      });
    });
    if (!parts.length) return null;

    const sources = [...new Set(parts.map(p => p.source))];
    const content = parts.map(p => `(from ${p.source})\n${p.text}`).join('\n\n---\n\n').slice(0, 8000);
    return { sources, content };
  } catch (e) {
    console.warn('Could not fetch Previous Solutions context (continuing without it)', e);
    return null;
  }
}

async function kbFetchToolsReferenceDoc(domainTools) {
  try {
    if (!embedReady()) return null; // can't embed search queries without a configured embedding provider
    if (!domainTools || !domainTools.length) return null;

    const seen = new Set();
    const parts = []; // [{ text, source }]
    const searches = await Promise.all(domainTools.map(dt =>
      fetch(KB_API_BASE + '/api/kb/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `${dt.tool} (${dt.domain}) — selection criteria and capabilities`,
          apiKey: STATE.settings.apiKey,
          embedModel: activeEmbedModel(),
          embedProvider: STATE.settings.embedProvider,
          ollamaUrl: STATE.settings.ollamaUrl,
          customApiUrl: STATE.settings.customApiUrl,
          customApiKey: STATE.settings.customApiKey,
          nvidiaApiKey: STATE.settings.nvidiaApiKey,
          topK: 3
        })
      }).then(res => res.ok ? res.json() : { chunks: [] }).catch(() => ({ chunks: [] }))
    ));
    searches.forEach(data => {
      (data.chunks || []).forEach(c => {
        const key = c.text.slice(0, 60);
        if (!seen.has(key)) { seen.add(key); parts.push({ text: c.text, source: c.source || 'uploaded document' }); }
      });
    });
    if (!parts.length) return null;

    const sources = [...new Set(parts.map(p => p.source))];
    const content = parts.map(p => `(from ${p.source})\n${p.text}`).join('\n\n---\n\n').slice(0, 8000);
    return { sources, content };
  } catch (e) {
    console.warn('Could not fetch tool reference context from the Knowledge Base (continuing without it)', e);
    return null;
  }
}

async function kbCheckHealth() {
  const pill = document.getElementById('kbHealthPill');
  if (!pill) return false;
  try {
    const res = await fetch(KB_API_BASE + '/api/health');
    const data = await res.json();
    if (res.ok && data.ok) {
      pill.textContent = 'Local KB server connected';
      pill.className = 'status-pill status-on';
      return true;
    }
    throw new Error(data.error || 'Not reachable');
  } catch (e) {
    pill.textContent = 'KB server offline — run "npm start" in /server';
    pill.className = 'status-pill status-off';
    return false;
  }
}

function kbSetProgress(percent, label, mode) {
  const wrap = document.getElementById('kbProgressWrap');
  const bar = document.getElementById('kbProgressBar');
  const lbl = document.getElementById('kbProgressLabel');
  if (!wrap || !bar || !lbl) return;
  wrap.classList.remove('hidden');
  bar.classList.remove('indeterminate', 'done', 'error');
  if (mode === 'indeterminate') {
    bar.classList.add('indeterminate');
  } else {
    bar.style.width = percent + '%';
    if (mode === 'done') bar.classList.add('done');
    if (mode === 'error') bar.classList.add('error');
  }
  lbl.textContent = label;
}

function kbHideProgress(delayMs) {
  const wrap = document.getElementById('kbProgressWrap');
  if (!wrap) return;
  setTimeout(() => {
    wrap.classList.add('hidden');
    const bar = document.getElementById('kbProgressBar');
    if (bar) { bar.classList.remove('indeterminate', 'done', 'error'); bar.style.width = '0%'; }
  }, delayMs || 0);
}

let kbCurrentUploadController = null;

function kbGetAdvancedOverrides() {
  const ids = {
    chunkSize: 'kbAdvChunkSize',
    chunkOverlap: 'kbAdvChunkOverlap',
    embedBatchSize: 'kbAdvEmbedBatch',
    upsertBatchSize: 'kbAdvUpsertBatch'
  };
  const out = {};
  Object.entries(ids).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el && el.value.trim()) out[key] = el.value.trim();
  });
  return out;
}

/* Uploads the raw file to the server, which chunks it and calls the
   configured embedding provider (server/server.js) using the key/model from
   Setup — no local model, no GPU involved. Progress streams back as
   Server-Sent Events (real batch-level progress for both the embedding and
   Qdrant-storing phases, not a guessed spinner), and the upload can be
   cancelled mid-flight via the Cancel button (AbortController). */
function kbUploadFile(file, sectionOverride) {
  const status = document.getElementById('kbUploadStatus');
  const label = document.getElementById('kbDropzoneLabel');
  const cancelBtn = document.getElementById('kbCancelUploadBtn');
  const allowed = ['.md', '.txt', '.json'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) {
    showToast('Only .md, .txt, and .json files are supported.', true);
    return;
  }
  if (!embedReady()) { showToast('Set up an embedding model (OpenRouter key, Ollama, or Custom API) in Setup first.', true); goToStep(1); return; }

  label.textContent = 'Uploading ' + file.name + '...';
  if (status) status.textContent = 'Embedding and storing ' + file.name + ' in the local Knowledge Base via ' + (isOllamaEmbed() ? 'Ollama' : isCustomApiEmbed() ? 'your Custom API' : 'OpenRouter') + ' (' + activeEmbedModel() + ')...';
  kbSetProgress(0, 'Uploading ' + file.name + '...', 'indeterminate');
  if (cancelBtn) { cancelBtn.style.display = 'inline-flex'; cancelBtn.disabled = false; }

  const form = new FormData();
  form.append('file', file);
  form.append('apiKey', STATE.settings.apiKey);
  form.append('embedModel', activeEmbedModel());
  form.append('embedProvider', STATE.settings.embedProvider);
  form.append('ollamaUrl', STATE.settings.ollamaUrl);
  form.append('customApiUrl', STATE.settings.customApiUrl || '');
  form.append('customApiKey', STATE.settings.customApiKey || '');
  const sectionEl = document.getElementById('kbUploadSection');
  form.append('docSection', sectionOverride || (sectionEl ? sectionEl.value : DEFAULT_CATCHALL_SECTION));
  const overrides = kbGetAdvancedOverrides();
  Object.entries(overrides).forEach(([k, v]) => form.append(k, v));

  const controller = new AbortController();
  kbCurrentUploadController = controller;
  if (cancelBtn) cancelBtn.onclick = () => controller.abort();

  const finish = () => {
    kbCurrentUploadController = null;
    if (cancelBtn) cancelBtn.style.display = 'none';
    label.textContent = 'Drop a .md, .txt, or .json file here, or click to choose one';
    kbHideProgress(2500);
  };

  fetch(KB_API_BASE + '/api/kb/upload', { method: 'POST', body: form, signal: controller.signal })
    .then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || ('HTTP ' + res.status));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result = null;
      let streamError = null;

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

          if (evt.type === 'start') {
            kbSetProgress(0, `Embedding "${file.name}"... 0/${evt.totalChunks} chunks`, 'determinate');
          } else if (evt.type === 'progress') {
            // Embedding is usually the slower phase, so it gets the bigger
            // share of the visible bar (0-70%); storing into Qdrant fills
            // the rest (70-100%).
            const frac = evt.total ? evt.done / evt.total : 0;
            const pct = evt.phase === 'embedding' ? Math.round(frac * 70) : 70 + Math.round(frac * 30);
            const label2 = evt.phase === 'embedding'
              ? `Embedding "${file.name}"... ${evt.done}/${evt.total} chunks (batch ${evt.batchNum}/${evt.totalBatches})`
              : `Storing "${file.name}" in Qdrant... ${evt.done}/${evt.total} points (batch ${evt.batchNum}/${evt.totalBatches})`;
            kbSetProgress(pct, label2, 'determinate');
          } else if (evt.type === 'done') {
            result = evt;
          } else if (evt.type === 'error') {
            streamError = evt.error;
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!result) throw new Error('Upload did not complete.');

      kbSetProgress(100, `Done — "${result.file}" added (${result.chunks} chunk${result.chunks === 1 ? '' : 's'}).`, 'done');
      showToast(`"${result.file}" added to the Knowledge Base (${result.chunks} chunk${result.chunks === 1 ? '' : 's'}).`);
      if (status) status.textContent = 'Uploaded files are chunked and embedded via the provider set in Setup (OpenRouter or Ollama), then stored in Qdrant. The "Ask AI" bubble (bottom-right, on every page) searches these when answering.';
      kbRenderDocuments();
      if (typeof aiRenderDocsList === 'function') aiRenderDocsList();
      kbRenderCollections();
    })
    .catch(e => {
      if (e.name === 'AbortError') {
        kbSetProgress(100, 'Cancelled.', 'error');
        showToast('Upload cancelled.', true);
        if (status) status.textContent = 'Upload cancelled.';
      } else {
        console.error('KB upload error', e);
        kbSetProgress(100, 'Failed: ' + e.message, 'error');
        showToast('Could not upload file: ' + e.message, true);
        if (status) status.textContent = 'Upload failed: ' + e.message;
      }
    })
    .finally(finish);
}

// Which Qdrant collection Ask AI/uploads use. Matters since the same
// Qdrant instance may hold collections from other projects/scripts too —
// e.g. one seeded by a Python script under a different name. The server
// remembers your choice across restarts (server/kb-config.json); this
// lets you change it or create a new one.
async function kbRenderCollections() {
  const list = document.getElementById('kbCollectionsList');
  if (!list) return;
  try {
    const res = await fetch(KB_API_BASE + '/api/kb/collections');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not list collections.');
    const collections = data.collections || [];
    const active = data.active || []; // array -- every collection currently searched by Ask AI
    const primary = data.primary; // the one uploads/documents-table/tools.json use
    if (!collections.length) {
      list.innerHTML = '<p class="hint">No collections in this Qdrant instance yet — upload a file to create one.</p>';
      return;
    }
    list.innerHTML = collections.map(c => {
      const isActive = active.includes(c.name);
      const isPrimary = c.name === primary;
      return `
      <div class="ai-doc-checkbox-row kb-collection-row ${isActive ? 'active' : ''}">
        <input type="checkbox" id="kbColCk_${escapeAttr(c.name)}" ${isActive ? 'checked' : ''} data-kb-toggle-collection="${escapeAttr(c.name)}">
        <label for="kbColCk_${escapeAttr(c.name)}">
          <span class="kb-chromadbs-name">${escapeHtml(c.name)}</span>
          <span class="kb-chromadbs-meta">${c.count === null ? '' : c.count + ' item' + (c.count === 1 ? '' : 's')}${isPrimary ? ' — uploads go here' : ''}</span>
        </label>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-kb-toggle-collection]').forEach(ck => {
      ck.addEventListener('change', () => kbToggleCollection(ck.dataset.kbToggleCollection));
    });
  } catch (e) {
    console.error('KB collections list error', e);
    list.innerHTML = `<p class="hint">Could not reach the local KB server: ${escapeHtml(e.message)}</p>`;
  }
}

async function kbToggleCollection(name) {
  const status = document.getElementById('kbUploadStatus');
  try {
    const res = await fetch(KB_API_BASE + '/api/kb/collections/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not switch collections.');
    const active = data.active || [];
    showToast(active.length > 1
      ? `Ask AI now searches ${active.length} collections: ${active.join(', ')}.`
      : `Ask AI and uploads now use "${data.primary}".`);
    if (status) status.textContent = active.length > 1
      ? `Ask AI searches ${active.length} collections (${active.join(', ')}); uploads go to "${data.primary}".`
      : `Now searching the "${data.primary}" collection for Ask AI and uploads.`;
    kbRenderDocuments();
    if (typeof aiRenderDocsList === 'function') aiRenderDocsList();
    kbRenderCollections();
  } catch (e) {
    console.error('KB toggle collection error', e);
    showToast('Could not switch collections: ' + e.message, true);
    kbRenderCollections(); // revert the checkbox visually
  }
}

async function kbCreateCollection(name) {
  try {
    const res = await fetch(KB_API_BASE + '/api/kb/collections/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create that collection.');
    showToast(`Created "${name}" — Ask AI and uploads now use it.`);
    kbRenderDocuments();
    if (typeof aiRenderDocsList === 'function') aiRenderDocsList();
    kbRenderCollections();
  } catch (e) {
    console.error('KB create collection error', e);
    showToast('Could not create collection: ' + e.message, true);
  }
}

async function kbRenderDocuments() {
  const container = document.getElementById('kbDocSections');
  const emptyHint = document.getElementById('kbDocEmptyHint');
  if (!container) return;
  try {
    const res = await fetch(KB_API_BASE + '/api/kb/documents');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load documents.');
    const docs = data.documents || [];
    kbLastKnownDocCount = docs.length;
    if (typeof updateStepReadiness === 'function') updateStepReadiness();

    if (!docs.length) {
      container.innerHTML = '';
      if (emptyHint) emptyHint.style.display = 'block';
      return;
    }
    if (emptyHint) emptyHint.style.display = 'none';

    // Every named section (in the order they were created), plus the
    // catch-all last -- shown even when empty, so the ready/not-ready
    // light is meaningful (a section you expect a file in but haven't
    // uploaded yet should visibly read "not ready").
    const namedSections = (typeof allDocSections === 'function') ? allDocSections() : [];
    const sections = [...namedSections, DEFAULT_CATCHALL_SECTION];
    const bySection = {};
    sections.forEach(s => { bySection[s] = []; });
    docs.forEach(d => {
      const s = d.section && sections.includes(d.section) ? d.section : DEFAULT_CATCHALL_SECTION;
      bySection[s].push(d);
    });

    container.innerHTML = sections.map(sectionName => {
      const items = bySection[sectionName];
      const ready = items.length > 0;
      const rows = items.length
        ? items.map(d => kbDocRowHtml(d, sections)).join('')
        : `<div class="kb-doc-section-empty">No documents in this section yet.</div>`;
      return `
        <div class="kb-doc-section">
          <div class="kb-doc-section-head">
            <span class="kb-doc-section-light ${ready ? 'ready' : ''}" title="${ready ? 'Ready — has at least one document' : 'Not ready — no document uploaded yet'}"></span>
            <span class="kb-doc-section-title">${escapeHtml(sectionName)}</span>
            <span class="kb-doc-section-count">${items.length} item${items.length === 1 ? '' : 's'}</span>
          </div>
          <div class="kb-doc-section-body">${items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>File</th><th>Chunks</th><th>Uploaded</th><th>Section</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : rows}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('[data-kb-delete]').forEach(btn => {
      btn.addEventListener('click', () => kbDeleteDocument(btn.dataset.kbDelete));
    });
    container.querySelectorAll('[data-kb-export]').forEach(btn => {
      btn.addEventListener('click', () => kbExportDocument(btn.dataset.kbExport));
    });
    container.querySelectorAll('[data-kb-edit]').forEach(btn => {
      btn.addEventListener('click', () => kbEditDocument(btn.dataset.kbEdit, btn.dataset.kbEditSection));
    });
    container.querySelectorAll('[data-kb-move-section]').forEach(sel => {
      sel.addEventListener('change', () => kbReassignSection(sel.dataset.kbMoveSection, sel.value));
    });
  } catch (e) {
    console.error('KB list error', e);
    container.innerHTML = '';
    if (emptyHint) { emptyHint.style.display = 'block'; emptyHint.textContent = 'Could not reach the local KB server: ' + e.message; }
  }
}

function kbDocRowHtml(d, allSections) {
  const sectionOptions = allSections.map(s => `<option value="${escapeAttr(s)}" ${s === (d.section || DEFAULT_CATCHALL_SECTION) ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
  return `
      <tr>
        <td>${escapeHtml(d.source)}</td>
        <td>${d.chunks}</td>
        <td>${d.uploadedAt ? new Date(d.uploadedAt).toLocaleString() : ''}</td>
        <td><select class="kb-doc-section-select" data-kb-move-section="${escapeAttr(d.source)}">${sectionOptions}</select></td>
        <td class="kb-doc-actions">
          <button class="btn small secondary" data-kb-export="${escapeAttr(d.source)}">Export</button>
          <button class="btn small secondary" data-kb-edit="${escapeAttr(d.source)}" data-kb-edit-section="${escapeAttr(d.section || DEFAULT_CATCHALL_SECTION)}">Edit</button>
          <button class="btn small secondary" data-kb-delete="${escapeAttr(d.source)}">Remove</button>
        </td>
      </tr>`;
}

async function kbReassignSection(source, section) {
  try {
    const res = await fetch(KB_API_BASE + '/api/kb/documents/' + encodeURIComponent(source) + '/section', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not move document.');
    showToast(`Moved "${source}" to "${section}".`);
    kbRenderDocuments();
  } catch (e) {
    console.error('KB move-section error', e);
    showToast('Could not move document: ' + e.message, true);
  }
}

async function kbExportDocument(source) {
  try {
    const res = await fetch(KB_API_BASE + '/api/kb/documents/' + encodeURIComponent(source) + '/content');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not read file.');
    const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = source; // re-chunked/reassembled text, not a byte-perfect copy of the original upload
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Exported "${source}".`);
  } catch (e) {
    console.error('KB export error', e);
    showToast('Could not export file: ' + e.message, true);
  }
}

async function kbEditDocument(source, section) {
  try {
    const res = await fetch(KB_API_BASE + '/api/kb/documents/' + encodeURIComponent(source) + '/content');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not read file.');
    kbOpenEditModal(source, data.content, section);
  } catch (e) {
    console.error('KB edit-load error', e);
    showToast('Could not open file for editing: ' + e.message, true);
  }
}

function kbOpenEditModal(source, content, section) {
  let modal = document.getElementById('kbEditModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'kbEditModal';
    modal.className = 'kb-edit-modal-overlay hidden';
    modal.innerHTML = `
      <div class="kb-edit-modal">
        <div class="kb-edit-modal-head">
          <span id="kbEditModalTitle">Edit document</span>
          <button type="button" class="ai-panel-close" id="kbEditModalClose" aria-label="Close">&times;</button>
        </div>
        <textarea id="kbEditModalTextarea"></textarea>
        <p class="hint">Saving re-chunks and re-embeds this text via the provider set in Setup, replacing the file's old chunks under the same name.</p>
        <div class="add-row">
          <button class="btn primary small" id="kbEditModalSave">Save</button>
          <button class="btn secondary small" id="kbEditModalCancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#kbEditModalClose').addEventListener('click', () => modal.classList.add('hidden'));
    modal.querySelector('#kbEditModalCancel').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
  }
  document.getElementById('kbEditModalTitle').textContent = 'Edit — ' + source;
  document.getElementById('kbEditModalTextarea').value = content;
  const saveBtn = document.getElementById('kbEditModalSave');
  saveBtn.replaceWith(saveBtn.cloneNode(true)); // drop any previous listener before re-binding for this document
  document.getElementById('kbEditModalSave').addEventListener('click', () => {
    const newText = document.getElementById('kbEditModalTextarea').value;
    modal.classList.add('hidden');
    const syntheticFile = new File([newText], source, { type: 'text/plain' });
    kbUploadFile(syntheticFile, section); // same name -> replaces the old chunks; keeps its existing section
  });
  modal.classList.remove('hidden');
}

async function kbDeleteDocument(source) {
  if (!window.confirm(`Remove "${source}" from the Knowledge Base? This cannot be undone.`)) return;
  try {
    const res = await fetch(KB_API_BASE + '/api/kb/documents/' + encodeURIComponent(source), { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed.');
    showToast(`Removed "${source}".`);
    await kbRenderDocuments();
    if (typeof aiRenderDocsList === 'function') aiRenderDocsList();
  } catch (e) {
    console.error('KB delete error', e);
    showToast('Could not remove file: ' + e.message, true);
  }
}

function wireKnowledgeBaseUpload() {
  const dz = document.getElementById('kbDropzone');
  const fileInput = document.getElementById('kbFileInput');
  const createBtn = document.getElementById('kbCreateCollectionBtn');
  const newNameInput = document.getElementById('kbNewCollectionName');
  if (!dz || !fileInput) return;

  dz.addEventListener('click', () => fileInput.click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag');
    if (e.dataTransfer.files.length) kbUploadFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files.length) kbUploadFile(e.target.files[0]);
    fileInput.value = '';
  });

  if (createBtn && newNameInput) {
    createBtn.addEventListener('click', () => {
      const name = newNameInput.value.trim();
      if (!name) { showToast('Type a collection name first.', true); return; }
      kbCreateCollection(name);
      newNameInput.value = '';
    });
    newNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') createBtn.click(); });
  }

  const advToggle = document.getElementById('kbAdvancedToggle');
  const advPanel = document.getElementById('kbAdvancedPanel');
  if (advToggle && advPanel) {
    advToggle.addEventListener('click', () => {
      const nowHidden = advPanel.classList.toggle('hidden');
      advToggle.textContent = nowHidden ? 'Advanced upload settings ▾' : 'Advanced upload settings ▴';
    });
  }

  kbPopulateUploadSectionSelect();
  kbRenderSectionsManageList();
  const newSectionBtn = document.getElementById('kbNewSectionBtn');
  if (newSectionBtn) {
    newSectionBtn.addEventListener('click', () => {
      const name = window.prompt('New section name (e.g. "Zoho Book FAQ"):');
      if (!name || !name.trim()) return;
      const added = addDocSection(name);
      if (!added) { showToast('That name is invalid or already exists.', true); return; }
      kbPopulateUploadSectionSelect(added);
      kbRenderSectionsManageList();
      kbRenderDocuments();
      showToast(`Section "${added}" added.`);
    });
  }
  const sectionsToggle = document.getElementById('kbSectionsManageToggle');
  const sectionsPanel = document.getElementById('kbSectionsManagePanel');
  if (sectionsToggle && sectionsPanel) {
    sectionsToggle.addEventListener('click', () => {
      const nowHidden = sectionsPanel.classList.toggle('hidden');
      sectionsToggle.textContent = nowHidden ? 'Manage sections ▾' : 'Manage sections ▴';
    });
  }

  kbCheckHealth();
  kbRenderCollections();
}

function kbPopulateUploadSectionSelect(selected) {
  const sel = document.getElementById('kbUploadSection');
  if (!sel) return;
  const sections = [...((typeof allDocSections === 'function') ? allDocSections() : []), DEFAULT_CATCHALL_SECTION];
  const value = selected || sel.value || DEFAULT_CATCHALL_SECTION;
  sel.innerHTML = sections.map(s => `<option value="${escapeAttr(s)}" ${s === value ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
}

// Only the removable, user-managed sections are listed here -- the
// catch-all ("Additional documentation") is always present and never
// removable, so there's nothing to manage about it.
function kbRenderSectionsManageList() {
  const wrap = document.getElementById('kbSectionsManageList');
  if (!wrap) return;
  const sections = (typeof allDocSections === 'function') ? allDocSections() : [];
  if (!sections.length) {
    wrap.innerHTML = '<p class="hint">No sections yet — use "+ New section" above to add one.</p>';
    return;
  }
  wrap.innerHTML = sections.map(s => `
    <div class="ai-history-row" style="cursor:default">
      <span class="ai-history-row-title">${escapeHtml(s)}</span>
      <button class="btn small secondary" data-remove-section="${escapeAttr(s)}">Remove</button>
    </div>
  `).join('');
  wrap.querySelectorAll('[data-remove-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.removeSection;
      removeDocSection(name);
      kbPopulateUploadSectionSelect();
      kbRenderSectionsManageList();
      kbRenderDocuments(); // any file that was in the removed section falls back into the catch-all display
      showToast(`Section "${name}" removed.`);
    });
  });
}
