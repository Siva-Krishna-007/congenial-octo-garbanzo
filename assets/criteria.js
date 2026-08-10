/* The 15-item Document-step checklist. Each item is a single fused question
   covering both the internal/business angle and the client-facing angle
   (originally two separate 15-question reference lists), since both
   Preliminary and Requirement documents use the SAME 15-item checklist --
   not 30 separate questions. Seeded once from DEFAULT_CRITERIA below, then
   lives in localStorage -- Admin's "Document checklist criteria" tab can
   add/edit/delete these going forward. Every change is logged to its own
   append-only history table, same pattern as Team/Tools in masterData.js. */

const MASTER_CRITERIA_KEY = 'satsang_master_criteria_v1';
const CRITERIA_HISTORY_KEY = 'satsang_criteria_history_v1';

const DEFAULT_CRITERIA = [
  { purpose: 'Business Need & Solution Fit',
    question: 'What business problem or opportunity is driving this project, and how does the proposed solution address it?' },
  { purpose: 'Objectives, KPIs & Technical Approach',
    question: 'What measurable business outcomes are expected, and what architecture/technology approach is being proposed to achieve them?' },
  { purpose: 'Governance & Experience',
    question: 'Who are the key stakeholders, sponsor and final approver, and what relevant experience does the vendor have delivering similar projects?' },
  { purpose: 'Current State & Delivery Approach',
    question: 'What is the current process and its major pain points, and what implementation methodology/governance model will be used to address them?' },
  { purpose: 'Functional Scope & Timeline',
    question: 'What are the mandatory Phase 1 functional requirements, and what are the project phases, milestones, and estimated completion timeline?' },
  { purpose: 'Integration & Scope Definition',
    question: 'Which existing systems, databases, or third-party applications must integrate with this solution, and what is explicitly out of scope?' },
  { purpose: 'Access Control & Integration Approach',
    question: 'What user roles, permissions, and approval workflows are required, and how will integration with existing applications/infrastructure work?' },
  { purpose: 'Non-Functional Requirements & Security',
    question: 'What performance, scalability, availability, and security requirements must be met, and what security/compliance controls are included?' },
  { purpose: 'Data Migration & Quality Assurance',
    question: 'What data needs to be migrated and what is its expected quality, and how will testing, QA, and user acceptance testing be conducted?' },
  { purpose: 'Compliance & Transition',
    question: 'Are there any legal, regulatory, or compliance requirements, and how will data migration and system transition be managed?' },
  { purpose: 'Assumptions, Dependencies & Risk',
    question: 'What assumptions, dependencies, constraints, and risks -- on both the business and delivery side -- should be considered?' },
  { purpose: 'Budget, Timeline & Commercials',
    question: 'What budget and target implementation timeline have been approved, and what is the complete commercial proposal (implementation, licensing, maintenance)?' },
  { purpose: 'Risk Concerns & Post-Go-Live Support',
    question: 'What project risks or business concerns have been identified, and what post-deployment support, SLA, warranty, and training are included?' },
  { purpose: 'Acceptance Criteria & Change Handling',
    question: 'What are the acceptance criteria for successful project delivery, and how will future enhancements or change requests be handled?' },
  { purpose: 'Future Scalability & Sign-off Criteria',
    question: 'What future enhancements or expansion plans should the solution accommodate, and what measurable criteria define project acceptance and sign-off?' }
];

function seedMasterCriteria() {
  return DEFAULT_CRITERIA.map((c, i) => ({ id: 'crit-' + i, purpose: c.purpose, question: c.question }));
}

let MASTER_CRITERIA = loadJSON(MASTER_CRITERIA_KEY, null);
if (!MASTER_CRITERIA) { MASTER_CRITERIA = seedMasterCriteria(); saveJSON(MASTER_CRITERIA_KEY, MASTER_CRITERIA); }
// Migrate any older seed shape (separate qBusiness/qClient) to the single fused `question` field.
if (MASTER_CRITERIA.some(c => c.question === undefined)) {
  MASTER_CRITERIA = MASTER_CRITERIA.map(c => ({
    id: c.id,
    purpose: c.purpose,
    question: c.question || [c.qBusiness, c.qClient].filter(Boolean).join(' ')
  }));
  saveJSON(MASTER_CRITERIA_KEY, MASTER_CRITERIA);
}

let CRITERIA_HISTORY = loadJSON(CRITERIA_HISTORY_KEY, []).map(h => h.id ? h : Object.assign({}, h, { id: genHistId() }));
saveJSON(CRITERIA_HISTORY_KEY, CRITERIA_HISTORY);

function persistMasterCriteria() { saveJSON(MASTER_CRITERIA_KEY, MASTER_CRITERIA); }

function logCriteriaHistory(entry) {
  CRITERIA_HISTORY.unshift(Object.assign({ id: genHistId(), time: new Date().toISOString() }, entry));
  saveJSON(CRITERIA_HISTORY_KEY, CRITERIA_HISTORY);
}
function deleteCriteriaHistoryEntry(id) {
  CRITERIA_HISTORY = CRITERIA_HISTORY.filter(h => h.id !== id);
  saveJSON(CRITERIA_HISTORY_KEY, CRITERIA_HISTORY);
}

function reorderMasterCriteria(fromId, toId) { moveArrayItem(MASTER_CRITERIA, fromId, toId); persistMasterCriteria(); }
function sortMasterCriteriaAlpha() {
  MASTER_CRITERIA.sort((a, b) => a.purpose.localeCompare(b.purpose));
  persistMasterCriteria();
}

function addMasterCriteria(purpose, question) {
  const rec = {
    id: 'crit-custom-' + Date.now(),
    purpose: (purpose || 'New criterion').trim(),
    question: (question || '').trim()
  };
  insertSorted(MASTER_CRITERIA, rec, c => (c.purpose || '').toLowerCase());
  persistMasterCriteria();
  logCriteriaHistory({ action: 'added', name: rec.purpose, field: '—', oldValue: '—', newValue: rec.question || '—' });
  return rec;
}

function updateMasterCriteriaField(id, field, value) {
  const rec = MASTER_CRITERIA.find(c => c.id === id);
  if (!rec) return;
  const oldValue = rec[field];
  if (String(oldValue) === String(value)) return;
  rec[field] = value;
  persistMasterCriteria();
  logCriteriaHistory({ action: 'edited', name: rec.purpose, field, oldValue: oldValue || '—', newValue: rec[field] || '—' });
}

function deleteMasterCriteria(id) {
  const rec = MASTER_CRITERIA.find(c => c.id === id);
  if (!rec) return;
  MASTER_CRITERIA = MASTER_CRITERIA.filter(c => c.id !== id);
  persistMasterCriteria();
  logCriteriaHistory({ action: 'removed', name: rec.purpose, field: '—', oldValue: rec.question || '—', newValue: '—' });
}
