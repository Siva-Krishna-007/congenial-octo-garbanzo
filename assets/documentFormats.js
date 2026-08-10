/* Reference data supplied directly by the business, used to steer AI
   generation prompts (assets/openrouter.js) rather than free-generating
   from scratch every time -- keeps the checklist questions and document
   structures consistent with how the company actually works. */

// A curated bank of general discovery questions, grouped by topic.
// analyzeDocumentChecklist's "generalQuestions" checks each of these
// against the document first -- only genuinely unanswered ones get
// surfaced, rather than the model free-generating new questions that
// might miss ones this list specifically wants covered.
const GENERAL_QUESTIONS_BANK = {
  "Organization & Scale": [
    "Organization name and industry/vertical",
    "Total number of employees in the organization",
    "How many users will actually need access to the system",
    "How many distinct departments/teams will use the system",
    "Single location or multiple locations/branches — if multiple, how many and where",
    "Single legal entity or multiple entities/subsidiaries requiring separate instances",
    "Single country/currency operation or multi-country/multi-currency"
  ],
  "Current State & Existing Tools": [
    "What system(s) are currently used for this process — Excel, another software, manual/paper-based",
    "Why is the organization moving away from the current system (pain points)",
    "Is there existing data to be migrated — what type (masters, historical records, attachments) and approximate volume",
    "Are other Zoho products already in use in the organization? Which ones?",
    "Are there non-Zoho third-party tools this implementation needs to continue working alongside?"
  ],
  "Users, Roles & Access": [
    "Different user roles/designations that will use the system",
    "Does the organization require role-based access control / restricted visibility between departments or branches",
    "Primary point of contact for requirement clarification during the project",
    "Final decision-maker/approver for sign-off on the RD and deliverables"
  ],
  "Commercial & Timeline": [
    "Expected go-live date or hard deadline",
    "Is there an approved budget range already discussed",
    "Phased rollout or single go-live",
    "Is number of user licenses/add-ons already finalized, or part of this scoping exercise"
  ],
  "Integration & Technical": [
    "Does this implementation need to integrate with any other software/platform (specify, without assuming which)",
    "Are custom/automated workflows expected from day one (approvals, notifications, automations)",
    "Is API access or custom development anticipated, or is this a standard out-of-box implementation",
    "Are there mobile access requirements (field staff, on-the-go usage)"
  ],
  "Support, Training & Change Management": [
    "Who will be the internal system owner/admin post-implementation",
    "What level of training is expected (admin-only, end-user, train-the-trainer)",
    "Is there an internal champion/team assigned to work with SSPL through discovery and UAT"
  ]
};

function generalQuestionsBankText() {
  return Object.entries(GENERAL_QUESTIONS_BANK)
    .map(([cat, qs]) => `${cat}:\n${qs.map(q => '- ' + q).join('\n')}`)
    .join('\n\n');
}

// Section structures for the four document types now live in
// Admin > Template Library (assets/masterData.js: MASTER_TEMPLATE_LIBRARY),
// organized per template category (Manufacturing ERP, Web Application, AI
// RAG Automation, IT Infrastructure Cloud, or any custom ones added there),
// each fully editable as a real list (add/edit/remove/reorder) rather than
// raw text. See docSectionsFromContents()/docSectionsText() below.

// Live accessor -- always reads the current admin-edited Template Library,
// so an edit there takes effect immediately without needing a page reload.
// templateId defaults to STATE.templateId (the category picked in the
// Document step) when not passed explicitly, and getTemplateSections()
// itself falls back to the first template category if that id is stale.
function docSectionsFromContents(docKey, templateId) {
  const tid = templateId || (typeof STATE !== 'undefined' && STATE.templateId) || null;
  return (typeof getTemplateSections === 'function') ? getTemplateSections(tid, docKey) : [];
}

function docSectionsText(docKey, templateId) {
  return docSectionsFromContents(docKey, templateId).join(', ');
}

