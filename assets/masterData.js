/* The Admin tab's source of truth for team members and Zoho tools/editions.
   Seeded once from the costing sheet's raw data (DEFAULT_TEAM/DEFAULT_TOOLS in
   data.js), then lives entirely in localStorage from that point on — Admin
   edits here are what every NEW proposal's Team & Tools step offers. Every
   add/edit/delete is logged to a separate history array (kept apart for team
   vs tools, as asked), never overwritten, only ever appended to. */

const MASTER_TEAM_KEY = 'satsang_master_team_v1';
const MASTER_TOOLS_KEY = 'satsang_master_tools_v1';
const TEAM_HISTORY_KEY = 'satsang_team_history_v1';
const TOOLS_HISTORY_KEY = 'satsang_tools_history_v1';
const CUSTOM_DOMAINS_KEY = 'satsang_custom_domains_v1';

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn('Could not read', key, e);
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Could not save', key, e);
  }
}

function seedMasterTeam() {
  return JSON.parse(JSON.stringify(DEFAULT_TEAM))
    .filter(m => (m.name || '').trim().toLowerCase() !== 'average cost')
    .map((m, i) => ({ id: 'team-' + i, name: m.name, costPerHour: m.costPerHour, role: FIXED_ROLE_BY_NAME[m.name] || '' }));
}

function seedMasterTools() {
  return JSON.parse(JSON.stringify(DEFAULT_TOOLS))
    .filter(t => t.monthly != null || t.yearly != null)
    .map((t, i) => ({ id: 'tool-' + i, tool: t.tool, domain: t.domain || '', edition: t.edition, monthly: t.monthly, yearly: t.yearly, notes: t.notes }));
}

let MASTER_TEAM = loadJSON(MASTER_TEAM_KEY, null);
if (!MASTER_TEAM) { MASTER_TEAM = seedMasterTeam(); saveJSON(MASTER_TEAM_KEY, MASTER_TEAM); }

let MASTER_TOOLS = loadJSON(MASTER_TOOLS_KEY, null);
if (!MASTER_TOOLS) {
  MASTER_TOOLS = seedMasterTools();
  saveJSON(MASTER_TOOLS_KEY, MASTER_TOOLS);
} else if (MASTER_TOOLS.some(t => t.domain === undefined)) {
  // One-time migration for anyone with tools already saved from before the
  // Domain field existed -- backfill by matching tool+edition against the
  // current DEFAULT_TOOLS list (which now carries domain for every priced
  // entry); anything genuinely custom/unmatched just gets '' (shown as
  // "— none —" in the UI, editable per-row same as any other field).
  const lookup = {};
  DEFAULT_TOOLS.forEach(t => { lookup[(t.tool + '|' + t.edition).toLowerCase()] = t.domain || ''; });
  MASTER_TOOLS = MASTER_TOOLS.map(t => ({
    ...t,
    domain: t.domain !== undefined ? t.domain : (lookup[(t.tool + '|' + t.edition).toLowerCase()] || '')
  }));
  saveJSON(MASTER_TOOLS_KEY, MASTER_TOOLS);
}

let TEAM_HISTORY = loadJSON(TEAM_HISTORY_KEY, []).map(h => h.id ? h : Object.assign({}, h, { id: genHistId() }));
let TOOLS_HISTORY = loadJSON(TOOLS_HISTORY_KEY, []).map(h => h.id ? h : Object.assign({}, h, { id: genHistId() }));
saveJSON(TEAM_HISTORY_KEY, TEAM_HISTORY);
saveJSON(TOOLS_HISTORY_KEY, TOOLS_HISTORY);

// Domains for the Zoho tools & editions Domain field, fully customisable:
// seeded once from Zoho's own 13 (assets/zohoToolkit.js) the very first
// time this ever loads, then this stored list is the sole source of truth
// from then on -- add, rename by removing+re-adding, or remove ANY entry,
// including the originally-seeded ones. (ZOHO_TOOLKIT itself is untouched
// either way -- this only ever affects the Domain dropdown here.)
let CUSTOM_DOMAINS = (function seedDomains() {
  if (localStorage.getItem(CUSTOM_DOMAINS_KEY) !== null) return loadJSON(CUSTOM_DOMAINS_KEY, []);
  const seeded = (typeof zohoDomains === 'function') ? zohoDomains().slice() : [];
  saveJSON(CUSTOM_DOMAINS_KEY, seeded);
  return seeded;
})();
function persistCustomDomains() { saveJSON(CUSTOM_DOMAINS_KEY, CUSTOM_DOMAINS); }
function addCustomDomain(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const exists = allDomainNames().some(d => d.toLowerCase() === trimmed.toLowerCase());
  if (exists) return trimmed;
  CUSTOM_DOMAINS.push(trimmed);
  persistCustomDomains();
  return trimmed;
}
function removeCustomDomain(name) {
  CUSTOM_DOMAINS = CUSTOM_DOMAINS.filter(d => d !== name);
  persistCustomDomains();
}
function allDomainNames() {
  return CUSTOM_DOMAINS.slice().sort();
}

// Team member roles, same pattern: seeded once from the 4 built-ins
// (ROLE_OPTIONS in data.js), then fully mutable from then on -- including
// removing an originally-built-in one.
const CUSTOM_ROLES_KEY = 'satsang_custom_roles_v1';
let CUSTOM_ROLES = (function seedRoles() {
  if (localStorage.getItem(CUSTOM_ROLES_KEY) !== null) return loadJSON(CUSTOM_ROLES_KEY, []);
  const seeded = ROLE_OPTIONS.slice();
  saveJSON(CUSTOM_ROLES_KEY, seeded);
  return seeded;
})();
function persistCustomRoles() { saveJSON(CUSTOM_ROLES_KEY, CUSTOM_ROLES); }
function addCustomRole(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const exists = allRoleOptions().some(r => r.toLowerCase() === trimmed.toLowerCase());
  if (exists) return trimmed;
  CUSTOM_ROLES.push(trimmed);
  persistCustomRoles();
  return trimmed;
}
function removeCustomRole(name) {
  CUSTOM_ROLES = CUSTOM_ROLES.filter(r => r !== name);
  persistCustomRoles();
}
function allRoleOptions() {
  return CUSTOM_ROLES.slice();
}

// Knowledge Base document sections/categories -- organizes uploaded
// documents into labeled groups (e.g. "Zoho Book FAQ") each with a
// ready/not-ready indicator, instead of one flat file list. Seeded once
// with a starter set; fully add/removable from then on, same pattern as
// domains and roles. "Additional documentation" is the default catch-all
// for anything not explicitly assigned elsewhere -- kept out of the
// removable list (removing it would just orphan every unassigned file
// back into a group that no longer has a name), always sorted last.
// removable list (removing it would just orphan every unassigned file
// back into a group that no longer has a name), always sorted last.
// Template Library -- replaces the old single free-text "Document
// Contents" blob. Organized as named template categories (e.g.
// "Manufacturing ERP", "Web Application"), each holding its own
// structured section list per document type (PRD/DRD/Proposal/SOW).
// Admin > Template Library provides full CRUD (add/rename/delete a
// category; add/edit/delete/reorder sections within a category+doc type)
// instead of editing raw text. The Document step's checklist is built
// dynamically by checking the uploaded document against whichever
// template+docType the user picked (see docSectionsFromContents() in
// assets/documentFormats.js), rather than iterating a fixed list of
// admin-authored criteria.
const TEMPLATE_LIBRARY_KEY = 'satsang_template_library_v1';
const TEMPLATE_LIBRARY_HISTORY_KEY = 'satsang_template_library_history_v1';
const DOC_KEYS = ['prd', 'drd', 'proposal', 'sow'];
const DOC_KEY_LABELS = { prd: 'PRD', drd: 'DRD', proposal: 'Proposal', sow: 'SOW' };

const DEFAULT_TEMPLATE_LIBRARY = [
  {
    "id": "tpl-manufacturing-erp",
    "name": "01 Manufacturing ERP",
    "sections": {
      "prd": [
        "Document Information",
        "Revision History",
        "Executive Summary",
        "Client / Company Profile",
        "Business Overview",
        "Business Objectives",
        "Existing Business Process",
        "Existing Systems",
        "Current Software",
        "Current Hardware",
        "Current Documents & Forms",
        "Stakeholders",
        "Departments",
        "User Types",
        "Current Pain Points",
        "Functional Requirements",
        "Non-Functional Requirements",
        "Business Rules",
        "Reporting Requirements",
        "Dashboard Requirements",
        "Integration Requirements",
        "Compliance Requirements",
        "Data Migration",
        "Assumptions",
        "Constraints",
        "Dependencies",
        "Project Scope",
        "In Scope",
        "Out of Scope",
        "Success Criteria",
        "Open Questions",
        "Appendices"
      ],
      "drd": [
        "Document Information",
        "Revision History",
        "System Overview",
        "Organization & Branch Setup",
        "User Roles & Permissions",
        "Customer Management",
        "Supplier Management",
        "Item / Product Master",
        "Raw Material Management",
        "Reel Inventory Management",
        "Job Card Management",
        "Production Management",
        "Production Routing",
        "Quality Management",
        "Purchase Management",
        "Sales Management",
        "Delivery & Dispatch",
        "Invoicing",
        "GST / E-Invoicing",
        "Accounting",
        "Costing",
        "Job-wise Profitability",
        "HR & Attendance",
        "Payroll",
        "Notifications & Alerts",
        "Reports",
        "Dashboards",
        "Integrations",
        "Data Migration",
        "Audit Trail",
        "Security & Access Control",
        "Workflow Specifications",
        "Detailed Business Rules",
        "Validation Rules",
        "Exception Handling",
        "Acceptance Criteria",
        "Appendices"
      ],
      "proposal": [
        "Cover Page",
        "Document Information",
        "Executive Summary",
        "Understanding of Client",
        "Business Overview",
        "Current Challenges",
        "Project Objectives",
        "Proposed Solution",
        "Proposed Modules",
        "Solution Architecture",
        "Key Features",
        "Manufacturing Process Digitization",
        "Inventory Management Solution",
        "Production Management Solution",
        "Sales & Invoicing Solution",
        "Accounting Solution",
        "HR & Payroll Solution",
        "Reports & Dashboards",
        "Integrations",
        "Data Migration",
        "Implementation Approach",
        "Project Phases",
        "Deliverables",
        "Training",
        "Deployment",
        "Support & Maintenance",
        "Project Timeline",
        "Project Team",
        "Commercials",
        "Assumptions",
        "Exclusions",
        "Terms & Conditions",
        "Acceptance"
      ],
      "sow": [
        "Document Information",
        "Project Overview",
        "Project Objectives",
        "Scope Overview",
        "Modules in Scope",
        "Functional Scope",
        "Manufacturing Scope",
        "Inventory Scope",
        "Production Scope",
        "Purchase Scope",
        "Sales & Invoicing Scope",
        "Accounting Scope",
        "HR & Payroll Scope",
        "Reporting Scope",
        "Dashboard Scope",
        "Integration Scope",
        "Data Migration Scope",
        "User & Role Configuration",
        "Workflow Configuration",
        "Technical Deliverables",
        "Testing",
        "User Acceptance Testing",
        "Training",
        "Deployment",
        "Support",
        "Acceptance Criteria",
        "Out of Scope",
        "Client Responsibilities",
        "SSPL Responsibilities",
        "Project Timeline",
        "Change Request Process",
        "Sign-off"
      ]
    }
  },
  {
    "id": "tpl-web-application",
    "name": "02 Web Application",
    "sections": {
      "prd": [
        "Document Information",
        "Revision History",
        "Executive Summary",
        "Client Information",
        "Organization Overview",
        "Business Objectives",
        "Problem Statement",
        "Existing Business Process",
        "Existing Application / System",
        "Current Technology",
        "Current Hardware / Devices",
        "Current Documents & Data",
        "Stakeholders",
        "Departments",
        "User Types",
        "User Roles",
        "Current Pain Points",
        "Functional Requirements",
        "Non-Functional Requirements",
        "UI / UX Requirements",
        "Platform Requirements",
        "Browser & Device Requirements",
        "Data Requirements",
        "Integration Requirements",
        "Security Requirements",
        "Reporting Requirements",
        "Notification Requirements",
        "Project Scope",
        "In Scope",
        "Out of Scope",
        "Assumptions",
        "Constraints",
        "Dependencies",
        "Success Criteria",
        "Open Questions",
        "Appendices"
      ],
      "drd": [
        "Document Information",
        "Revision History",
        "System Overview",
        "System Architecture",
        "User Roles & Permissions",
        "Authentication",
        "User Management",
        "Module 1",
        "Module 2",
        "Module 3",
        "Module 4",
        "Functional Specifications",
        "UI / UX Specifications",
        "Page / Screen Specifications",
        "Navigation Structure",
        "Database Design",
        "Data Model",
        "API Specifications",
        "Business Logic",
        "Validation Rules",
        "Search & Filtering",
        "Notifications",
        "Reports",
        "Dashboard",
        "Third-Party Integrations",
        "Security",
        "Audit Logs",
        "Performance Requirements",
        "Backup & Recovery",
        "Error Handling",
        "Deployment",
        "Testing",
        "User Acceptance Testing",
        "Acceptance Criteria",
        "Appendices"
      ],
      "proposal": [
        "Cover Page",
        "Document Information",
        "Executive Summary",
        "Understanding of Client",
        "Business Problem",
        "Project Objectives",
        "Proposed Application",
        "Proposed Modules",
        "Key Features",
        "User Experience Approach",
        "UI / UX Approach",
        "Technology Approach",
        "System Architecture",
        "Integration Approach",
        "Security Approach",
        "Development Methodology",
        "Implementation Approach",
        "Project Phases",
        "Deliverables",
        "Testing",
        "Deployment",
        "Training",
        "Support & Maintenance",
        "Project Timeline",
        "Project Team",
        "Commercials",
        "Assumptions",
        "Exclusions",
        "Terms & Conditions",
        "Acceptance"
      ],
      "sow": [
        "Document Information",
        "Project Overview",
        "Project Objectives",
        "Application Scope",
        "User Scope",
        "Functional Scope",
        "Module-wise Scope",
        "UI / UX Scope",
        "Frontend Scope",
        "Backend Scope",
        "Database Scope",
        "API Scope",
        "Integration Scope",
        "Security Scope",
        "Reporting Scope",
        "Notification Scope",
        "Testing Scope",
        "UAT Scope",
        "Deployment Scope",
        "Training Scope",
        "Documentation",
        "Support & Maintenance",
        "Deliverables",
        "Acceptance Criteria",
        "Out of Scope",
        "Client Responsibilities",
        "SSPL Responsibilities",
        "Project Timeline",
        "Change Management",
        "Sign-off"
      ]
    }
  },
  {
    "id": "tpl-ai-rag-automation",
    "name": "03 AI RAG Automation",
    "sections": {
      "prd": [
        "Document Information",
        "Revision History",
        "Executive Summary",
        "Client Information",
        "Organization Overview",
        "Business Objectives",
        "Problem Statement",
        "Existing Business Process",
        "Existing AI / Automation Systems",
        "Current Software & Tools",
        "Current Data Sources",
        "Stakeholders",
        "Departments",
        "User Types",
        "User Roles",
        "AI Use Cases",
        "Automation Use Cases",
        "Knowledge Sources",
        "Document Sources",
        "Data Sources",
        "AI Functional Requirements",
        "RAG Requirements",
        "Search Requirements",
        "Question & Answer Requirements",
        "Response Requirements",
        "Accuracy Requirements",
        "Human Review Requirements",
        "Security & Privacy",
        "Integration Requirements",
        "Reporting & Analytics",
        "Performance Requirements",
        "Model Requirements",
        "Data Migration",
        "Project Scope",
        "In Scope",
        "Out of Scope",
        "Assumptions",
        "Constraints",
        "Dependencies",
        "Success Criteria",
        "Open Questions",
        "Appendices"
      ],
      "drd": [
        "Document Information",
        "Revision History",
        "AI System Overview",
        "AI System Architecture",
        "User Roles & Permissions",
        "Authentication & Authorization",
        "Data Sources",
        "Knowledge Sources",
        "Document Ingestion",
        "Document Processing",
        "OCR",
        "Text Extraction",
        "Chunking Strategy",
        "Metadata Management",
        "Embedding Generation",
        "Vector Database",
        "Retrieval",
        "Reranking",
        "Prompt Engineering",
        "LLM Configuration",
        "Context Management",
        "Response Generation",
        "Citations & Source References",
        "Conversation Memory",
        "AI Guardrails",
        "Hallucination Handling",
        "Human Review",
        "Workflow Automation",
        "API Integration",
        "User Interface",
        "Admin Panel",
        "Logging",
        "Monitoring",
        "Security",
        "Data Privacy",
        "Performance",
        "AI Evaluation",
        "Accuracy Metrics",
        "Testing",
        "Deployment",
        "Acceptance Criteria",
        "Appendices"
      ],
      "proposal": [
        "Cover Page",
        "Document Information",
        "Executive Summary",
        "Understanding of Client",
        "Business Problem",
        "Project Objectives",
        "Proposed AI Solution",
        "Proposed Use Cases",
        "AI Architecture",
        "RAG Architecture",
        "Knowledge Processing",
        "Data Processing",
        "Model Strategy",
        "Key Capabilities",
        "Automation Capabilities",
        "Security & Privacy",
        "Integration Approach",
        "AI Evaluation Approach",
        "Implementation Methodology",
        "Project Phases",
        "Deliverables",
        "Testing & Evaluation",
        "Training",
        "Deployment",
        "Support & Maintenance",
        "Project Timeline",
        "Project Team",
        "Commercials",
        "Assumptions",
        "Exclusions",
        "Terms & Conditions",
        "Acceptance"
      ],
      "sow": [
        "Document Information",
        "Project Overview",
        "Project Objectives",
        "AI Use Case Scope",
        "Automation Scope",
        "Data Source Scope",
        "Document Source Scope",
        "Data Ingestion Scope",
        "Document Processing Scope",
        "RAG Scope",
        "Model Scope",
        "Prompt Engineering Scope",
        "Application Scope",
        "User Interface Scope",
        "Integration Scope",
        "Security Scope",
        "Evaluation Scope",
        "Testing Scope",
        "Deployment Scope",
        "Training Scope",
        "Monitoring Scope",
        "Documentation",
        "Deliverables",
        "Acceptance Criteria",
        "Out of Scope",
        "Client Responsibilities",
        "SSPL Responsibilities",
        "Project Timeline",
        "Change Request Process",
        "Sign-off"
      ]
    }
  },
  {
    "id": "tpl-it-infrastructure-cloud",
    "name": "04 IT Infrastructure Cloud",
    "sections": {
      "prd": [
        "Document Information",
        "Revision History",
        "Executive Summary",
        "Organization Overview",
        "Business Objectives",
        "Existing Infrastructure",
        "Existing Network",
        "Existing Servers",
        "Existing Storage",
        "Existing Cloud Services",
        "Existing Security Infrastructure",
        "Users & Locations",
        "Existing Applications",
        "Current Hardware",
        "Current Software",
        "Current IT Processes",
        "Current Pain Points",
        "Infrastructure Requirements",
        "Network Requirements",
        "Server Requirements",
        "Storage Requirements",
        "Compute Requirements",
        "Cloud Requirements",
        "Availability Requirements",
        "Performance Requirements",
        "Security Requirements",
        "Backup Requirements",
        "Disaster Recovery Requirements",
        "Monitoring Requirements",
        "Integration Requirements",
        "Compliance Requirements",
        "Migration Requirements",
        "Stakeholders",
        "User Types",
        "Project Scope",
        "In Scope",
        "Out of Scope",
        "Assumptions",
        "Constraints",
        "Dependencies",
        "Success Criteria",
        "Open Questions",
        "Appendices"
      ],
      "drd": [
        "Document Information",
        "Revision History",
        "Current Architecture",
        "Target Architecture",
        "Network Architecture",
        "Server Architecture",
        "Storage Architecture",
        "Compute Infrastructure",
        "Cloud Infrastructure",
        "Identity & Access Management",
        "Firewall & Network Security",
        "Endpoint Security",
        "Server Security",
        "Data Security",
        "Backup Architecture",
        "Disaster Recovery",
        "High Availability",
        "Monitoring",
        "Logging",
        "Alerting",
        "Capacity Planning",
        "Performance Requirements",
        "Infrastructure Migration",
        "Application Migration",
        "Integration Requirements",
        "Configuration Specifications",
        "Deployment Architecture",
        "Testing",
        "Security Testing",
        "Disaster Recovery Testing",
        "Acceptance Criteria",
        "Appendices"
      ],
      "proposal": [
        "Cover Page",
        "Document Information",
        "Executive Summary",
        "Understanding of Client",
        "Existing Infrastructure",
        "Current Challenges",
        "Project Objectives",
        "Proposed Infrastructure",
        "Target Architecture",
        "Network Solution",
        "Server Solution",
        "Storage Solution",
        "Cloud Solution",
        "Security Solution",
        "Backup Solution",
        "Disaster Recovery Solution",
        "Monitoring Solution",
        "Migration Approach",
        "Implementation Methodology",
        "Project Phases",
        "Deliverables",
        "Testing",
        "Deployment",
        "Training",
        "Support & Maintenance",
        "Project Timeline",
        "Project Team",
        "Commercials",
        "Assumptions",
        "Exclusions",
        "Terms & Conditions",
        "Acceptance"
      ],
      "sow": [
        "Document Information",
        "Project Overview",
        "Project Objectives",
        "Infrastructure Scope",
        "Network Scope",
        "Server Scope",
        "Storage Scope",
        "Compute Scope",
        "Cloud Scope",
        "Security Scope",
        "Identity & Access Scope",
        "Backup Scope",
        "Disaster Recovery Scope",
        "Monitoring Scope",
        "Migration Scope",
        "Integration Scope",
        "Configuration Scope",
        "Testing Scope",
        "Deployment Scope",
        "Documentation",
        "Training",
        "Support & Maintenance",
        "Deliverables",
        "Acceptance Criteria",
        "Out of Scope",
        "Client Responsibilities",
        "SSPL Responsibilities",
        "Project Timeline",
        "Change Request Process",
        "Sign-off"
      ]
    }
  }
];

let MASTER_TEMPLATE_LIBRARY = loadJSON(TEMPLATE_LIBRARY_KEY, null);
if (!MASTER_TEMPLATE_LIBRARY || !MASTER_TEMPLATE_LIBRARY.length) {
  MASTER_TEMPLATE_LIBRARY = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE_LIBRARY));
  saveJSON(TEMPLATE_LIBRARY_KEY, MASTER_TEMPLATE_LIBRARY);
}
let TEMPLATE_LIBRARY_HISTORY = loadJSON(TEMPLATE_LIBRARY_HISTORY_KEY, []);

function persistTemplateLibrary() { saveJSON(TEMPLATE_LIBRARY_KEY, MASTER_TEMPLATE_LIBRARY); }
function logTemplateLibraryHistory(entry) {
  TEMPLATE_LIBRARY_HISTORY.unshift(Object.assign({ id: genHistId(), time: new Date().toISOString() }, entry));
  saveJSON(TEMPLATE_LIBRARY_HISTORY_KEY, TEMPLATE_LIBRARY_HISTORY);
}

function getTemplateCategory(templateId) {
  return MASTER_TEMPLATE_LIBRARY.find(t => t.id === templateId) || MASTER_TEMPLATE_LIBRARY[0] || null;
}

// Section list for a given template + doc type ('prd'|'drd'|'proposal'|'sow').
// Falls back to the first template category if templateId isn't found, so
// the app never shows a blank checklist just because of a stale selection.
function getTemplateSections(templateId, docKey) {
  const cat = getTemplateCategory(templateId);
  return (cat && cat.sections && cat.sections[docKey]) ? cat.sections[docKey] : [];
}

function addTemplateCategory(name) {
  const trimmed = (name || '').trim() || 'New Template';
  const id = 'tpl-' + trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
  const rec = { id, name: trimmed, sections: { prd: [], drd: [], proposal: [], sow: [] } };
  MASTER_TEMPLATE_LIBRARY.push(rec);
  persistTemplateLibrary();
  logTemplateLibraryHistory({ action: 'added template', name: trimmed, field: '—', oldValue: '—', newValue: '—' });
  return rec;
}

function renameTemplateCategory(templateId, name) {
  const cat = getTemplateCategory(templateId);
  if (!cat) return;
  const trimmed = (name || '').trim();
  if (!trimmed || trimmed === cat.name) return;
  const old = cat.name;
  cat.name = trimmed;
  persistTemplateLibrary();
  logTemplateLibraryHistory({ action: 'renamed template', name: trimmed, field: 'name', oldValue: old, newValue: trimmed });
}

function deleteTemplateCategory(templateId) {
  const cat = getTemplateCategory(templateId);
  if (!cat || MASTER_TEMPLATE_LIBRARY.length <= 1) return false; // always keep at least one template
  MASTER_TEMPLATE_LIBRARY = MASTER_TEMPLATE_LIBRARY.filter(t => t.id !== templateId);
  persistTemplateLibrary();
  logTemplateLibraryHistory({ action: 'removed template', name: cat.name, field: '—', oldValue: '—', newValue: '—' });
  return true;
}

function addTemplateSection(templateId, docKey, name) {
  const cat = getTemplateCategory(templateId);
  const trimmed = (name || '').trim();
  if (!cat || !trimmed || !DOC_KEYS.includes(docKey)) return;
  cat.sections[docKey].push(trimmed);
  persistTemplateLibrary();
  logTemplateLibraryHistory({ action: 'added section', name: `${cat.name} / ${DOC_KEY_LABELS[docKey]}`, field: '—', oldValue: '—', newValue: trimmed });
}

function updateTemplateSection(templateId, docKey, idx, name) {
  const cat = getTemplateCategory(templateId);
  if (!cat || !DOC_KEYS.includes(docKey)) return;
  const list = cat.sections[docKey];
  const trimmed = (name || '').trim();
  if (!list || idx < 0 || idx >= list.length || !trimmed || trimmed === list[idx]) return;
  const old = list[idx];
  list[idx] = trimmed;
  persistTemplateLibrary();
  logTemplateLibraryHistory({ action: 'edited section', name: `${cat.name} / ${DOC_KEY_LABELS[docKey]}`, field: '—', oldValue: old, newValue: trimmed });
}

function deleteTemplateSection(templateId, docKey, idx) {
  const cat = getTemplateCategory(templateId);
  if (!cat || !DOC_KEYS.includes(docKey)) return;
  const list = cat.sections[docKey];
  if (!list || idx < 0 || idx >= list.length) return;
  const [removed] = list.splice(idx, 1);
  persistTemplateLibrary();
  logTemplateLibraryHistory({ action: 'removed section', name: `${cat.name} / ${DOC_KEY_LABELS[docKey]}`, field: '—', oldValue: removed, newValue: '—' });
}

function reorderTemplateSection(templateId, docKey, fromIdx, toIdx) {
  const cat = getTemplateCategory(templateId);
  if (!cat || !DOC_KEYS.includes(docKey)) return;
  const list = cat.sections[docKey];
  if (!list || fromIdx < 0 || fromIdx >= list.length || toIdx < 0 || toIdx >= list.length) return;
  const [item] = list.splice(fromIdx, 1);
  list.splice(toIdx, 0, item);
  persistTemplateLibrary();
}


const CUSTOM_DOC_SECTIONS_KEY = 'satsang_doc_sections_v1';
const DEFAULT_CATCHALL_SECTION = 'Additional documentation';
let CUSTOM_DOC_SECTIONS = (function seedDocSections() {
  if (localStorage.getItem(CUSTOM_DOC_SECTIONS_KEY) !== null) return loadJSON(CUSTOM_DOC_SECTIONS_KEY, []);
  const seeded = ['Zoho Book FAQ', 'Zoho Book Help', 'Zoho Tool Description', 'Previous Solutions'];
  saveJSON(CUSTOM_DOC_SECTIONS_KEY, seeded);
  return seeded;
})();
function persistDocSections() { saveJSON(CUSTOM_DOC_SECTIONS_KEY, CUSTOM_DOC_SECTIONS); }
function addDocSection(name) {
  const trimmed = (name || '').trim();
  if (!trimmed || trimmed === DEFAULT_CATCHALL_SECTION) return null;
  const exists = allDocSections().some(s => s.toLowerCase() === trimmed.toLowerCase());
  if (exists) return trimmed;
  CUSTOM_DOC_SECTIONS.push(trimmed);
  persistDocSections();
  return trimmed;
}
function removeDocSection(name) {
  if (name === DEFAULT_CATCHALL_SECTION) return; // the catch-all itself is never removable
  CUSTOM_DOC_SECTIONS = CUSTOM_DOC_SECTIONS.filter(s => s !== name);
  persistDocSections();
}
// The removable, user-managed sections only (for the manage list) -- the
// catch-all is appended separately wherever the full picker list is needed.
function allDocSections() {
  return CUSTOM_DOC_SECTIONS.slice();
}

function persistMasterTeam() { saveJSON(MASTER_TEAM_KEY, MASTER_TEAM); }
function persistMasterTools() { saveJSON(MASTER_TOOLS_KEY, MASTER_TOOLS); }

function genHistId() { return 'h-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function logTeamHistory(entry) {
  TEAM_HISTORY.unshift(Object.assign({ id: genHistId(), time: new Date().toISOString() }, entry));
  saveJSON(TEAM_HISTORY_KEY, TEAM_HISTORY);
}
function logToolsHistory(entry) {
  TOOLS_HISTORY.unshift(Object.assign({ id: genHistId(), time: new Date().toISOString() }, entry));
  saveJSON(TOOLS_HISTORY_KEY, TOOLS_HISTORY);
}

function deleteTeamHistoryEntry(id) {
  TEAM_HISTORY = TEAM_HISTORY.filter(h => h.id !== id);
  saveJSON(TEAM_HISTORY_KEY, TEAM_HISTORY);
}
function deleteToolsHistoryEntry(id) {
  TOOLS_HISTORY = TOOLS_HISTORY.filter(h => h.id !== id);
  saveJSON(TOOLS_HISTORY_KEY, TOOLS_HISTORY);
}

function insertSorted(arr, rec, keyFn) {
  const idx = arr.findIndex(x => keyFn(x).localeCompare(keyFn(rec)) > 0);
  if (idx === -1) arr.push(rec); else arr.splice(idx, 0, rec);
}

function moveArrayItem(arr, fromId, toId) {
  const fromIdx = arr.findIndex(x => x.id === fromId);
  const toIdx = arr.findIndex(x => x.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
  const [item] = arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, item);
}

function reorderMasterTeam(fromId, toId) { moveArrayItem(MASTER_TEAM, fromId, toId); persistMasterTeam(); }
function reorderMasterTools(fromId, toId) { moveArrayItem(MASTER_TOOLS, fromId, toId); persistMasterTools(); }

function sortMasterTeamAlpha() {
  MASTER_TEAM.sort((a, b) => a.name.localeCompare(b.name));
  persistMasterTeam();
}
function sortMasterToolsAlpha() {
  MASTER_TOOLS.sort((a, b) => (a.tool + ' ' + a.edition).localeCompare(b.tool + ' ' + b.edition));
  persistMasterTools();
}

function addMasterTeamMember(name, costPerHour, role) {
  const rec = { id: 'team-custom-' + Date.now(), name: (name || 'New member').trim(), costPerHour: Number(costPerHour) || 0, role: role || '' };
  insertSorted(MASTER_TEAM, rec, m => (m.name || '').toLowerCase());
  persistMasterTeam();
  logTeamHistory({ action: 'added', name: rec.name, field: '—', oldValue: '—', newValue: `${fmtMoney(rec.costPerHour)}/hr, ${rec.role || 'no role'}` });
  return rec;
}

function updateMasterTeamField(id, field, value) {
  const rec = MASTER_TEAM.find(m => m.id === id);
  if (!rec) return;
  const oldValue = rec[field];
  if (String(oldValue) === String(value)) return;
  rec[field] = field === 'costPerHour' ? (Number(value) || 0) : value;
  persistMasterTeam();
  logTeamHistory({ action: 'edited', name: rec.name, field, oldValue: field === 'costPerHour' ? fmtMoney(oldValue) : (oldValue || '—'), newValue: field === 'costPerHour' ? fmtMoney(rec[field]) : (rec[field] || '—') });
}

function deleteMasterTeamMember(id) {
  const rec = MASTER_TEAM.find(m => m.id === id);
  if (!rec) return;
  MASTER_TEAM = MASTER_TEAM.filter(m => m.id !== id);
  persistMasterTeam();
  logTeamHistory({ action: 'removed', name: rec.name, field: '—', oldValue: `${fmtMoney(rec.costPerHour)}/hr`, newValue: '—' });
}

function addMasterTool(tool, domain, edition, monthly, yearly, notes) {
  const rec = {
    id: 'tool-custom-' + Date.now(),
    tool: (tool || 'New tool').trim(),
    domain: domain || '',
    edition: (edition || '').trim(),
    monthly: monthly === '' || monthly == null ? null : Number(monthly),
    yearly: yearly === '' || yearly == null ? null : Number(yearly),
    notes: notes || ''
  };
  insertSorted(MASTER_TOOLS, rec, t => (t.tool + ' ' + t.edition).toLowerCase());
  persistMasterTools();
  logToolsHistory({ action: 'added', name: `${rec.tool} (${rec.edition})`, field: '—', oldValue: '—', newValue: `M:${rec.monthly ?? '—'} / Y:${rec.yearly ?? '—'}` });
  return rec;
}

function updateMasterToolField(id, field, value) {
  const rec = MASTER_TOOLS.find(t => t.id === id);
  if (!rec) return;
  const oldValue = rec[field];
  const newValue = (field === 'monthly' || field === 'yearly') ? (value === '' ? null : Number(value)) : value;
  if (String(oldValue) === String(newValue)) return;
  rec[field] = newValue;
  persistMasterTools();
  logToolsHistory({ action: 'edited', name: `${rec.tool} (${rec.edition})`, field, oldValue: oldValue == null ? '—' : oldValue, newValue: newValue == null ? '—' : newValue });
}

function deleteMasterTool(id) {
  const rec = MASTER_TOOLS.find(t => t.id === id);
  if (!rec) return;
  MASTER_TOOLS = MASTER_TOOLS.filter(t => t.id !== id);
  persistMasterTools();
  logToolsHistory({ action: 'removed', name: `${rec.tool} (${rec.edition})`, field: '—', oldValue: `M:${rec.monthly ?? '—'} / Y:${rec.yearly ?? '—'}`, newValue: '—' });
}
