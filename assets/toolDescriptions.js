/* Structured, editable per-tool description used in the Knowledge Base.
   Schema (6 fixed sections) is taken from tool_description.json's category
   structure; SEED_TOOL_DESCRIPTIONS below is that file's actual content,
   converted to this schema. Every other tool starts blank and is filled in
   by hand in the Knowledge Base -- this replaces the old read-only
   'notes' text as the grounding data for AI tool-fit checks. */

const TOOL_DESC_KEY = 'satsang_tool_descriptions_v1';

const TOOL_DESC_SECTIONS = [
  { key: 'faqs', label: 'FAQs & Troubleshooting' },
  { key: 'devDocs', label: 'Developer Docs & API Reference' },
  { key: 'pricingPages', label: 'Pricing & Feature Comparison' },
  { key: 'integrations', label: 'App Store & Integrations' },
  { key: 'releaseNotes', label: 'Release Notes, Blogs & Roadmap' },
  { key: 'community', label: 'Community Forums & Scripting Guides' }
];

const SEED_TOOL_DESCRIPTIONS = {
  "Legal::Contracts": {
    "faqs": "Information extracted from FAQs and troubleshooting guides highlights common user hurdles, system constraints, and operational workarounds. For Zoho Contracts, these sources detail how to resolve template formatting errors, manage locked clauses during active negotiations, and troubleshoot stalled multi-tier approval workflows. They also provide crucial edge-case data, such as how the system handles contract termination reversals, the limitations of document versioning when collaborating with external counterparties, and the exact steps required to recover archived obligations, which is vital for assessing detailed operational requirements.",
    "devDocs": "The developer documentation provides the technical blueprint required for deep system integration. It outlines the REST API endpoints used to programmatically generate contracts, fetch active contract statuses, and extract metadata for external storage. This section details the authentication protocols (OAuth 2.0), API rate limits per user/organization, and the structural payload of webhooks that trigger notifications when a contract transitions between states (e.g., from 'In Approval' to 'Executed'). This data is strictly necessary for DRD evaluations where automated, backend-driven contract generation is required.",
    "pricingPages": "Pricing and feature comparison pages supply the hard limits and tier-gated constraints essential for determining platform feasibility. For Zoho Contracts, this data reveals that fundamental features like custom templates and basic approval workflows are available on lower tiers, while advanced capabilities like obligation management, clause-level analytics, and granular role-based access control (RBAC) are gated behind Enterprise plans. It also defines quantitative caps, such as the maximum number of active contracts, custom fields allowed per module, and allocated storage limits.",
    "integrations": "The native integrations directory maps out the out-of-the-box connectivity of the platform, which is critical for PRD capabilities. Zoho Contracts heavily leverages zero-code integrations with Zoho Sign for seamless digital signature execution and Zoho CRM for auto-populating contract templates with sales deal data. Furthermore, this source highlights supported third-party ecosystem connectors, such as Google Workspace or Microsoft Office 365, allowing businesses to gauge if the tool fits smoothly into their existing IT infrastructure without custom middleware.",
    "releaseNotes": "Release notes and product blogs provide a timeline of feature maturity and future capabilities. For Zoho Contracts, these sources reveal recent enhancements like AI-assisted clause extraction, UI optimizations for mobile accessibility, and rolling compliance updates to meet shifting global legal standards. By tracking the roadmap, system architects can evaluate if a missing PRD requirement (e.g., automated third-party paper ingestion) is actively being developed or if it fundamentally falls outside the product's scope.",
    "community": "Community forums and Deluge scripting guides uncover the true customization depth of the platform when native UI features fall short. These sources contain practical examples of how developers use Zoho's proprietary scripting language (Deluge) to write custom validation rules, auto-calculate contractual penalties, or trigger complex conditional workflows based on CRM data changes. This information is critical for a DRD assessment, as it dictates whether highly specific, non-standard business logic can be successfully implemented."
  },
  "Sales::Sign": {
    "faqs": "Troubleshooting articles for Zoho Sign focus heavily on resolving document delivery failures, authentication bypass issues, and signing portal errors. These guides explain how to handle expired signing links, troubleshoot Knowledge-Based Authentication (KBA) or OTP delivery delays, and rectify errors when uploading corrupted or oversized PDF files. They also clarify system behaviors regarding document recall mechanisms and the process for correcting signer details mid-flight, providing necessary insights into day-to-day operational constraints.",
    "devDocs": "The API reference and developer SDKs are critical for assessing Zoho Sign's embedded capabilities. The documentation details how to generate embedded signing URLs to keep users within a proprietary application (via iFrames), utilize client SDKs (JavaScript, iOS, Android), and manage webhook callbacks for granular event tracking (e.g., 'document_viewed', 'document_completed'). It also strictly defines the API credit consumption model, multipart file upload limits, and the exact JSON payload structures required to map dynamic data into pre-defined SignForms.",
    "pricingPages": "Pricing matrices define the economic and technical ceilings for Zoho Sign. This data outlines the monthly document quotas allocated to Free, Standard, Professional, and Enterprise users. Crucially for DRD assessments, it highlights which tiers unlock enterprise-grade features such as blockchain timestamping, trusted digital certificates (eIDAS/Aadhaar), advanced custom branding (white-labeling domains and emails), bulk sending limits, and access to the API endpoints.",
    "integrations": "The integrations directory lists the ecosystem touchpoints that require zero custom code. Zoho Sign natively connects with major cloud storage providers (Google Drive, Dropbox, OneDrive, Box) for automatic document backup. It also highlights deep native embedding within CRM systems (Zoho CRM, Salesforce, Hubspot) to trigger signature requests directly from lead or deal records, and details integration with automation hubs like Zapier and Zoho Flow for cross-application routing.",
    "releaseNotes": "Blogs and release notes track the ongoing expansion of Zoho Sign's legal jurisdiction and compliance capabilities. These sources detail announcements regarding new integrations with regional Trust Service Providers (TSPs), support for localized digital identity frameworks, and enhancements to accessibility standards. Monitoring this provides insight into whether the platform is scaling to meet the regulatory requirements of new geographic markets outlined in a high-level PRD.",
    "community": "Forums and scripting guides reveal how users engineer complex signing workflows beyond the standard UI. They provide scripts and workarounds for dynamically routing documents based on conditional logic (e.g., sending to a different director based on contract value), extracting field data from completed documents to update external databases, and building custom reminder intervals using Deluge. This is vital for determining if a highly bespoke, edge-case workflow is technically feasible."
  },
  "IoT::IoT": {
    "faqs": "FAQs and troubleshooting resources for Zoho IoT address the realities of deploying physical hardware to cloud networks. They provide actionable steps for diagnosing device disconnects, handling telemetry parsing errors, and resolving dashboard widget rendering issues. Furthermore, they explain how the system manages offline data caching when edge gateways lose internet connection and the synchronization logic applied once connectivity is restored, which is vital for assessing system reliability in harsh environments.",
    "devDocs": "The developer documentation defines the technical communication bridge between physical assets and the cloud. It details the supported ingestion protocols (MQTT, HTTP, CoAP), authentication methods (X.509 certificates, SAS tokens), and the required JSON payload structures for incoming telemetry. For DRD evaluations, this section is paramount as it dictates the API limits for data polling, the rate limits for command-and-control actions sent back to actuators, and the endpoints used to query historical time-series data for external machine learning models.",
    "pricingPages": "Pricing comparisons provide the hard quantitative limits required to architect an IoT deployment. The documentation specifies tier-based quotas on the maximum number of connected devices, the allowed message ingestion rate (datapoints per second/minute), and the total payload storage capacity. It also details historical data retention windows\u2014showing how long telemetry data is stored before being archived or purged\u2014and limits on the number of custom dashboards or concurrent user access.",
    "integrations": "The integrations directory outlines how Zoho IoT bridges the gap between hardware telemetry and enterprise software. It highlights out-of-the-box connectors to Zoho Desk and Zoho ServiceDesk for automatically generating maintenance tickets when a sensor crosses a critical threshold. It also details integrations with Zoho Analytics for deep, cross-module business intelligence, and SMS/Email gateway connections for immediate operational alerting, checking off core PRD automation requirements.",
    "releaseNotes": "Product roadmaps and release blogs showcase the evolution of the platform's analytical and edge computing capabilities. These sources cover the rollout of new machine learning-based anomaly detection models, enhancements to edge-gateway processing logic, and announcements of new hardware vendor partnerships. This helps system evaluators determine if the platform is actively investing in predictive maintenance capabilities or expanding its library of pre-certified, plug-and-play sensors.",
    "community": "Community guides and scripting documentation demonstrate the platform's data transformation capabilities. Because IoT sensors often send raw, uncalibrated data, these sources show how developers use Deluge scripts to parse complex hex payloads, calculate derived metrics (e.g., converting raw voltage to temperature), and build multi-condition logic gates for alerts. Understanding these scripting capabilities is essential for a DRD to ensure the platform can handle proprietary hardware data structures."
  }
};

let MASTER_TOOL_DESC = loadJSON(TOOL_DESC_KEY, null);
if (!MASTER_TOOL_DESC) { MASTER_TOOL_DESC = JSON.parse(JSON.stringify(SEED_TOOL_DESCRIPTIONS)); saveJSON(TOOL_DESC_KEY, MASTER_TOOL_DESC); }

function toolDescKey(domain, tool) { return domain + '::' + tool; }

function getToolDescription(domain, tool) {
  const key = toolDescKey(domain, tool);
  const existing = MASTER_TOOL_DESC[key];
  const blank = { faqs: '', devDocs: '', pricingPages: '', integrations: '', releaseNotes: '', community: '' };
  return existing ? Object.assign({}, blank, existing) : blank;
}

function setToolDescriptionField(domain, tool, field, value) {
  const key = toolDescKey(domain, tool);
  if (!MASTER_TOOL_DESC[key]) MASTER_TOOL_DESC[key] = {};
  MASTER_TOOL_DESC[key][field] = value;
  saveJSON(TOOL_DESC_KEY, MASTER_TOOL_DESC);
}

// Every non-empty section joined into one block of grounding text, for the
// AI tool-fit check in the Document step's Send to AI call.
function combinedToolDescriptionText(domain, tool) {
  const d = getToolDescription(domain, tool);
  return TOOL_DESC_SECTIONS
    .filter(s => (d[s.key] || '').trim())
    .map(s => `${s.label}: ${d[s.key].trim()}`)
    .join('\n');
}

// Whether a tool has any human-written description content yet (vs a blank stub).
function hasToolDescription(domain, tool) {
  const d = getToolDescription(domain, tool);
  return TOOL_DESC_SECTIONS.some(s => (d[s.key] || '').trim());
}
