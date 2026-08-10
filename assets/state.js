/* Central app state.
   Two different persistence lifetimes, deliberately:
   - Setup (API key, model, company info, defaults) is genuinely reusable
     across proposals, so it's saved in localStorage and sticks around.
   - Everything else (uploaded document, client details, team, tools, the
     generated proposal, and any edits) is per working-session only, saved in
     sessionStorage — closing the tab/browser clears it automatically, and
     there's also an explicit "New proposal" button for resetting on demand
     without waiting for that. */

const SETTINGS_KEY = 'satsang_proposal_studio_settings_v1';
const SESSION_KEY = 'satsang_proposal_studio_session_v1';

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Could not read saved settings', e);
    return null;
  }
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Could not read session state', e);
    return null;
  }
}

function defaultSettings() {
  return {
    apiKey: '',
    model: 'anthropic/claude-sonnet-4.5',
    customModel: '',
    embedModel: 'nvidia/nemotron-3-embed-1b:free',
    customEmbedModel: '',
    chatProvider: 'openrouter',   // 'openrouter' | 'ollama' | 'custom'
    embedProvider: 'openrouter',  // 'openrouter' | 'ollama' | 'custom'
    ollamaUrl: 'http://localhost:11434',
    ollamaChatModel: 'llama3.2',
    ollamaEmbedModel: 'nomic-embed-text',
    ollamaContextLength: '', // blank = Ollama/model default; Admin > LLM Context. Ollama chat calls only, never applied to OpenRouter.
    customApiUrl: 'http://localhost:20128/v1', // defaults to OmniRoute's standard local gateway address; replace with any other OpenAI-compatible base URL if not using OmniRoute
    customApiKey: '',        // separate from the OpenRouter key above, since it's a different service
    customApiChatModel: '',
    customApiEmbedModel: '',
    nvidiaApiKey: '',        // from build.nvidia.com -- separate service, separate key. Base URL is fixed (NVIDIA_BASE_URL in state.js), nothing to configure there
    nvidiaChatModel: '',
    nvidiaEmbedModel: '',
    providerName: 'Satsang Solutions Private Limited',
    providerLocation: 'Madurai, Tamil Nadu',
    providerAbout: document.getElementById('providerAbout') ? document.getElementById('providerAbout').value : '',
    providerTagline: 'Structure . System . Scale . Success', // shown in the document footer band -- matches the current logo's tagline
    companyLogo: '',          // base64 data URI, uploaded via Admin > Logo. Falls back to DEFAULT_LOGO_DATA_URI (assets/logoData.js) when empty
    companyLogoW: null,       // natural pixel size of the uploaded logo -- templates need explicit width/height attrs since Word ignores CSS max-width on images
    companyLogoH: null,
    previousCompanyLogo: '',  // one-step undo for Admin > Logo's "Revoke changes"
    previousCompanyLogoW: null,
    previousCompanyLogoH: null,
    gstPercent: 18,
    validityDays: 7,
    currencySymbol: 'Rs.',
    pctAdvance: 100,
    pctSignoff: 75,
    pctGolive: 25
  };
}

function defaultClient() {
  return { clientCompany: '', clientContact: '', docNumber: '', docVersion: 'V1.0', clientIndustry: '', clientLogo: '', clientLogoW: null, clientLogoH: null };
}

function defaultTeam() {
  return JSON.parse(JSON.stringify(MASTER_TEAM)).map(m => ({
    id: m.id,
    name: m.name,
    costPerHour: m.costPerHour,
    role: FIXED_ROLE_BY_NAME[m.name] || m.role || '',
    included: false,
    hoursMapping: 0,
    hoursImplementation: 0,
    hoursHypercare: 0
  }));
}

function defaultTools() {
  return JSON.parse(JSON.stringify(MASTER_TOOLS)).map(t => ({
    id: t.id,
    tool: t.tool,
    edition: t.edition,
    monthly: t.monthly,
    yearly: t.yearly,
    notes: t.notes,
    included: false,
    qty: 1,
    cycle: t.yearly != null ? 'yearly' : 'monthly'
  }));
}

function defaultQa() {
  return { general: [], tools: [], client: [], company: [] }; // [{ q: '...', a: '...' }, ...] -- client/company kept only for older saved sessions
}

// The 15-item checklist, freshly seeded from Admin's MASTER_CRITERIA for
// every new document. Starts unanalyzed -- "Send to AI" is what fills in
// met/answer for each item; nothing here is guessed locally.
function defaultChecklist(docType, templateId) {
  const sections = (typeof docSectionsFromContents === 'function')
    ? docSectionsFromContents(docType === 'requirement' ? 'drd' : 'prd', templateId)
    : [];
  if (sections.length) {
    return sections.map((name, i) => ({
      id: 'doc-sec-' + i,
      purpose: name,
      question: `Does the document address "${name}"?`,
      answer: '',
      met: false,
      agreed: false,
      declined: false
    }));
  }
  // Fallback only if the Template Library selection is somehow empty -- keeps the app
  // functional rather than showing a blank checklist.
  return MASTER_CRITERIA.map(c => ({
    id: c.id,
    purpose: c.purpose,
    question: c.question,
    answer: '',
    met: false,
    agreed: false,
    declined: false
  }));
}

// True once the Document step's checklist has been run AND every item has
// been explicitly agreed or declined (N/A) -- both actions set `agreed`.
// Used to grey out / block the Team & Tools step until the PRD or DRD has
// been checked against the selected template and every question resolved.
function checklistFullyResolved() {
  return !!STATE.checklistReady && STATE.checklist.length > 0 && STATE.checklist.every(item => item.agreed);
}

function freshSessionState() {
  // Computed first (rather than referenced via STATE, which may still be
  // mid-construction the very first time this runs) so the initial
  // checklist below is seeded from the right template from the start.
  const defaultTemplateId = (typeof MASTER_TEMPLATE_LIBRARY !== 'undefined' && MASTER_TEMPLATE_LIBRARY[0]) ? MASTER_TEMPLATE_LIBRARY[0].id : null;
  return {
    client: defaultClient(),
    docType: 'preliminary',    // 'preliminary' | 'requirement'
    templateId: defaultTemplateId, // Template Library category picked in the Document step
    prelimText: '',
    uploadedFileName: '',      // the actual uploaded file's name, e.g. "Bilda Packs DRD.docx" -- used as the Pending tab label instead of a generic fallback
    checklist: defaultChecklist('preliminary', defaultTemplateId),
    checklistReady: false,     // true once "Send to AI" has analyzed the document
    domainTools: [],           // [{ domain, tool }, ...] reference picks from zoho-comprehensive-toolkit.json
    aiSuggestions: [],         // suggestions from the last "Send to AI" analysis
    toolFit: [],                // [{ tool, domain, verdict, comment }] from the last analysis
    qa: defaultQa(),
    drdText: '',           // the canonical Detailed Requirement Document text driving Team&Tools/Generate Proposal/Generate SOW -- either AI-generated from a preliminary doc (via the "Create Detailed Requirement Document" popup) or, for docType 'requirement', a direct copy of prelimText itself
    drd: null,              // structured Detailed Requirement Document JSON (assets/openrouter.js: generateDrdAndSolutions)
    drdHtml: '',            // the rendered/editable formatted DRD built from STATE.drd (assets/main.js: buildDrdHtml)
    solutions: [],          // [{id, name, description, tools, requirementsAddressed, sourceNote, status: 'pending'|'accepted'|'declined'}] -- Solution Suggestions, shown after the DRD is ready
    team: defaultTeam(),
    tools: defaultTools(),
    proposal: null,       // filled after generation
    editedHtml: null,     // live-edited HTML snapshot, once touched
    sow: null,              // Scope of Work structured data (DRD flow) -- same JSON+template pattern as STATE.proposal
    sowHtml: null,          // the rendered/editable HTML built from STATE.sow (assets/main.js: buildSowHtml)
    pendingId: null        // set when resumed from Pending, so re-saving updates it in place
  };
}

let STATE = (function () {
  const settings = Object.assign(defaultSettings(), loadSettings() || {});
  const session = loadSession();
  const base = freshSessionState();

  if (session) {
    if (session.client) Object.assign(base.client, session.client);
    base.docType = session.docType || base.docType;
    base.templateId = session.templateId || base.templateId;
    base.prelimText = session.prelimText || '';
    base.uploadedFileName = session.uploadedFileName || '';
    base.checklist = (session.checklist && session.checklist.length) ? session.checklist : base.checklist;
    base.checklistReady = !!session.checklistReady;
    base.domainTools = session.domainTools || base.domainTools;
    base.aiSuggestions = session.aiSuggestions || [];
    base.toolFit = session.toolFit || [];
    base.qa = session.qa || base.qa;
    base.drdText = session.drdText || '';
    base.drd = session.drd || null;
    base.drdHtml = session.drdHtml || '';
    base.solutions = session.solutions || [];
    base.team = (session.team && session.team.length)
      ? session.team.map(m => ({ role: FIXED_ROLE_BY_NAME[m.name] || '', ...m }))
      : base.team;
    base.tools = (session.tools && session.tools.length) ? session.tools : base.tools;
    base.proposal = session.proposal || null;
    base.editedHtml = session.editedHtml || null;
    base.sow = session.sow || null;
    base.sowHtml = session.sowHtml || null;
    base.pendingId = session.pendingId || null;
  }

  return { settings, ...base };
})();

function persist() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(STATE.settings));
  } catch (e) {
    console.warn('Could not save settings', e);
  }
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      client: STATE.client,
      docType: STATE.docType,
      templateId: STATE.templateId,
      prelimText: STATE.prelimText,
      uploadedFileName: STATE.uploadedFileName,
      checklist: STATE.checklist,
      checklistReady: STATE.checklistReady,
      domainTools: STATE.domainTools,
      aiSuggestions: STATE.aiSuggestions,
      toolFit: STATE.toolFit,
      qa: STATE.qa,
      drdText: STATE.drdText,
      drd: STATE.drd,
      drdHtml: STATE.drdHtml,
      solutions: STATE.solutions,
      team: STATE.team,
      tools: STATE.tools,
      proposal: STATE.proposal,
      editedHtml: STATE.editedHtml,
      sow: STATE.sow,
      sowHtml: STATE.sowHtml,
      pendingId: STATE.pendingId
    }));
  } catch (e) {
    console.warn('Could not save session state', e);
  }
  if (typeof updateStepReadiness === 'function') updateStepReadiness();
}

function activeModel() {
  if (STATE.settings.chatProvider === 'ollama') return (STATE.settings.ollamaChatModel || '').trim();
  if (STATE.settings.chatProvider === 'custom') return (STATE.settings.customApiChatModel || '').trim();
  if (STATE.settings.chatProvider === 'nvidia') return (STATE.settings.nvidiaChatModel || '').trim();
  return STATE.settings.model === '__custom__'
    ? (STATE.settings.customModel || '').trim()
    : STATE.settings.model;
}

function activeEmbedModel() {
  if (STATE.settings.embedProvider === 'ollama') return (STATE.settings.ollamaEmbedModel || '').trim();
  if (STATE.settings.embedProvider === 'custom') return (STATE.settings.customApiEmbedModel || '').trim();
  if (STATE.settings.embedProvider === 'nvidia') return (STATE.settings.nvidiaEmbedModel || '').trim();
  return STATE.settings.embedModel === '__custom__'
    ? (STATE.settings.customEmbedModel || '').trim()
    : STATE.settings.embedModel;
}

function isOllamaChat() { return STATE.settings.chatProvider === 'ollama'; }
function isOllamaEmbed() { return STATE.settings.embedProvider === 'ollama'; }
function isCustomApiChat() { return STATE.settings.chatProvider === 'custom'; }
function isCustomApiEmbed() { return STATE.settings.embedProvider === 'custom'; }
function isNvidiaChat() { return STATE.settings.chatProvider === 'nvidia'; }
function isNvidiaEmbed() { return STATE.settings.embedProvider === 'nvidia'; }
function ollamaBaseUrl() { return (STATE.settings.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, ''); }
function customApiBaseUrl() { return (STATE.settings.customApiUrl || '').replace(/\/+$/, ''); }
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'; // build.nvidia.com's OpenAI-compatible endpoint -- fixed, unlike OmniRoute's variable base URL, so there's nothing for the person to configure but the key/model

// The logo actually used in generated documents -- whatever's been
// uploaded via Admin > Logo, falling back to the built-in default
// (assets/logoData.js) if nothing's been uploaded yet.
function activeCompanyLogo() {
  return STATE.settings.companyLogo || (typeof DEFAULT_LOGO_DATA_URI !== 'undefined' ? DEFAULT_LOGO_DATA_URI : '');
}

// Natural pixel size of whichever logo activeCompanyLogo() returns, so
// templates can emit correct explicit width/height attributes.
function activeCompanyLogoSize() {
  if (STATE.settings.companyLogo) {
    return { width: STATE.settings.companyLogoW, height: STATE.settings.companyLogoH };
  }
  return {
    width: (typeof DEFAULT_LOGO_W !== 'undefined' ? DEFAULT_LOGO_W : null),
    height: (typeof DEFAULT_LOGO_H !== 'undefined' ? DEFAULT_LOGO_H : null)
  };
}

// Whether the person is actually ready to chat / embed right now, given
// whichever provider is selected -- OpenRouter, a Custom API/OmniRoute,
// and NVIDIA NIM all need a real API key (Custom API also needs its base
// URL, since that one varies; NVIDIA's is fixed). Ollama just needs a
// model name (it's a local server, no key).
function chatReady() {
  if (isOllamaChat()) return !!activeModel();
  if (isCustomApiChat()) return !!(customApiBaseUrl() && STATE.settings.customApiKey && activeModel());
  if (isNvidiaChat()) return !!(STATE.settings.nvidiaApiKey && activeModel());
  return !!(STATE.settings.apiKey && activeModel());
}
function embedReady() {
  if (isOllamaEmbed()) return !!activeEmbedModel();
  if (isCustomApiEmbed()) return !!(customApiBaseUrl() && STATE.settings.customApiKey && activeEmbedModel());
  if (isNvidiaEmbed()) return !!(STATE.settings.nvidiaApiKey && activeEmbedModel());
  return !!(STATE.settings.apiKey && activeEmbedModel());
}
