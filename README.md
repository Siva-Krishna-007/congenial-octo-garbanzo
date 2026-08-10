# Satsang Proposal Studio

A small app: upload a preliminary/discovery document, pick the team members
and Zoho tools involved, and generate a client proposal in the same
8-section format as your reference template — with the pricing tables built
deterministically from your costing sheet data (never invented by the AI).

Chat and embedding calls go either straight from your browser to OpenRouter
(using your own API key) or to a local Ollama model on your machine — your
choice, set independently for each in **Setup**. A small local server (see
**Setup — one command, starts everything**, below) connects to a Qdrant
vector database (which you run yourself) for the Knowledge Base's storage;
nothing else is uploaded anywhere.

## Run it

Because the app loads a Web Worker for PDF parsing, some browsers block that
under a plain `file://` URL. The safest way to run it:

```bash
cd proposal-app
npm install
npm start
# then open http://localhost:3000 in your browser
```

(Any static server works — `npx serve`, VS Code's "Live Server", etc.)

Opening `index.html` directly by double-clicking also works in most browsers;
if PDF parsing fails silently, switch to the local-server method above or
upload a `.docx` instead.

## Setup (Step 1)

Both the **chat model** and the **embedding model** can independently run via
**OpenRouter** (cloud, needs an API key) or a **local Ollama** model (no key,
no cost, runs entirely on your machine) — toggle each with the
OpenRouter/Ollama buttons at the top of its card.

**OpenRouter (either card):**
1. Get an API key at https://openrouter.ai/keys and paste it in. It's stored
   only in your browser's `localStorage` — never sent anywhere but
   OpenRouter's API.
2. Pick a model (or type a custom OpenRouter model id). Chat defaults to
   `anthropic/claude-sonnet-4.5`; embeddings default to
   `nvidia/nemotron-3-embed-1b:free`, a free NVIDIA model.

**Ollama (either card), instead:**
1. [Install Ollama](https://ollama.com/download), then pull whichever
   model(s) you want: `ollama pull llama3.2` (chat) and/or
   `ollama pull nomic-embed-text` (embeddings) — a dedicated embedding
   model is strongly recommended over a chat model for the embedding role.
2. Run `ollama serve` (or just have the Ollama app running — it serves
   automatically) — it listens on `http://localhost:11434` by default.
3. Toggle the card to "Ollama (local)" — this auto-fetches your installed
   models (`GET /api/tags`) and fills a dropdown with them (a **↻** button
   next to it re-fetches on demand, e.g. after pulling a new model without
   reloading the page). Nothing to type; if the dropdown says "No models
   pulled yet," go pull one first. The server URL field (shared by both,
   shown once either is set to Ollama) defaults to `http://localhost:11434`
   — change it if Ollama runs elsewhere (e.g.
   `http://host.docker.internal:11434` from inside Docker), then hit **↻**
   again to reload the list from the new address.
4. **If you get a CORS error in the browser console:** Ollama blocks
   cross-origin browser requests by default, and this app's UI runs on a
   different port (`localhost:3000`) than Ollama (`localhost:11434`).
   Restart Ollama with `OLLAMA_ORIGINS=*` set (e.g. on Windows PowerShell:
   `$env:OLLAMA_ORIGINS="*"; ollama serve`) to allow it.
5. "Test connection" checks Ollama is reachable and that the chat model you
   typed is actually pulled, rather than testing an API key.

Whichever combination you choose, mixing providers is fine — e.g. OpenRouter
for chat (better quality) with Ollama for embeddings (zero cost, since
embedding runs far more often than chat: once per document chunk plus every
question). **One caveat carried over from switching OpenRouter embedding
models:** embeddings from two different models (or providers) are different
vector spaces even at the same dimensionality — if you switch embedding
provider/model mid-project, re-upload existing documents so everything in a
collection was embedded consistently.

Also: set your company info, GST %, and the advance/sign-off/go-live payment
split (still in Setup, further down).

## Data & resets

- **Setup** (API key, model, your company info, defaults) is saved in the
  browser's `localStorage` and genuinely persists across sessions — no need
  to re-enter your API key every time.
- **Everything else** (uploaded document, client details, team, tools, the
  generated proposal, and any edits) is saved in `sessionStorage`, which the
  browser clears automatically when you close the tab/window — a new browser
  session starts clean.
- Click **"+ New proposal"** in the sidebar any time to reset all of that
  immediately, without waiting to close the tab. Your API key and Setup
  defaults are left untouched.
- If you're updating from an older copy of this app and still see leftover
  data, do a full replace (delete the old folder, unzip the new one fresh)
  and hard-refresh the browser tab (Ctrl/Cmd+Shift+R) — browsers sometimes
  cache local JS files aggressively, and a normal refresh isn't always
  enough to pick up changed files.

## PDF & Word export

Both downloads read straight from the live, possibly hand-edited document in
Review & Export — never from a separate stored copy — so what you see is what
downloads.

PDF uses **pdfmake**, which lays out real vector text rather than
rasterizing a screenshot, so page breaks land cleanly between lines and never
mid-word. Each heading is grouped with the content immediately after it as an
"unbreakable" block, so a heading is pushed to the next page together with
its content instead of being left stranded alone at the bottom of a page.
Page numbers ("Page No :  N") appear bottom-right of every page in the same
green used for headings.

## Filling the gaps (Q&A) and Pending drafts

In the Document step, after uploading, click **"Generate questions"**. The AI
reads your document and writes at least 10 **client** questions (about their
organisation, stakeholders, processes) and at least 10 **company/engagement**
questions (systems in use, users/licences, budget, technical environment) —
whatever the document doesn't already answer. Type answers into any of them,
then:

- **Accept all answered** — folds every answered question into the extracted
  document text (as `Q: ... / A: ...` blocks) and generates from that.
  Unanswered questions stay put for later.
- **Save for later** — if the client's slow to respond, this stores the
  current document, client details, and whatever's been answered so far as a
  **Pending** draft (see the sidebar), then starts a brand new session so you
  can work on something else immediately.

The **Pending** tab lists every saved draft with **Resume** (loads it back
into the app to keep answering or generate from) and **Delete**. Pending
drafts are stored in `localStorage` and are **never removed automatically** —
not on a new session, not even after you've generated a full proposal from
one. Only Delete removes them.

## Document step — domain/tool selection, gated Send to AI, editable checklist

1. Pick **Preliminary Requirement Document** or **Detailed Requirement
   Document** from the dropdown — both use the same 15-item checklist (one
   fused question per item, covering both the internal/business and
   client-facing angle — 15 questions total, not 30).
2. Upload/paste the document.
3. **Domain / tool reference** (right below Upload) — pick a domain and tool.
   This immediately pre-adds any name-matching priced tool in Team & Tools.
   Once there's document text **and** at least one domain/tool picked, the
   **"Send to AI"** button in this card lights up green (it's grey and
   disabled otherwise) — this is the only network call in the Document step.
4. Clicking it reads the document plus each selected tool's written
   description (`assets/toolDescriptions.js` — no in-app editor currently;
   edit that file directly to expand it) and returns two things: the
   15-item checklist, and a **Fits / Differs** verdict per selected tool —
   whether it was selected correctly, and why. If a file named exactly
   `tools.json` (preferred) or `tools.md` exists in the Knowledge Base,
   that verdict is grounded in it
   as the authoritative reference (see **Knowledge Base**, below);
   otherwise it falls back to the tool's built-in description.
5. The checklist: items the AI found answered show **green**, read-only,
   with **Agree** (confirms it) / **Edit** (unlocks it for editing — the text
   stays; editing it un-agrees it, it doesn't get wiped) buttons. Items it
   couldn't find are **red** and directly editable — type an answer and
   click **Agree** to turn it green. Filter pills above the list (All /
   Criteria met / Criteria not met) narrow the view. Clicking "Generate
   proposal" later silently agrees any met-but-unconfirmed item first, so a
   forgotten click never blocks generation.
6. **"Questions you might have missed in the Preliminary Requirement
   Document"** — runs automatically right after "Send to AI" (no separate
   click needed; "Re-generate" re-runs it on demand), drafting two separate
   sections of questions the document doesn't already answer, every one
   phrased exactly as the company would ask it directly to the client:
   **General questions** (at least 10 — their organisation, stakeholders,
   process, timeline, budget) and **Tool-related questions** (at least 5 —
   grounded as much as possible in whatever the document already mentions
   about current tools/systems, digging deeper into what's there rather
   than asking generically, to sanity-check the selected Zoho tools). Each
   question has its own answer box you fill in by hand. **"Accept all
   answered"** folds your answers (from either section) straight into the
   document text (so they're included the same as anything else when
   generating the proposal); **"Save for later"** parks the whole draft —
   document, checklist, tool picks, and both sections' Q&A — in the
   **Pending** tab to resume anytime.

## Knowledge Base — tool pricing, reference docs (RAG), and Ask AI

**Zoho tools & editions** — the add/edit/delete/search/sort pricing table,
relocated here from Admin (step 5, next to Review & Export). Now includes a
**Domain** column/field (dropdown, first field when adding a tool) —
Zoho's own product categories, taken from `zohoDomains()` in
`assets/zohoToolkit.js` (Sales, Marketing, Commerce and POS, Service,
Finance, Email Storage and Collaboration, Human Resources, Legal, Security
and IT Management, BI and Analytics, Project Management, Developer
Platforms, IoT — matching zoho.com → Products → Apps' own grouping). All
110 pre-loaded tools (227 priced editions) were categorized this way,
matched programmatically against that same reference data by name; if you
already had tools saved from before this existed, they're backfilled
automatically the same way the first time the app loads. Search now
matches against domain too, and it's editable inline like any other field.

**"+ Add / Edit tool" panel** — a collapsible section (same pattern as the
Knowledge Base's "Advanced upload settings") above the table holds the
add-tool form, plus:
- **"+ New domain"** — create a domain beyond Zoho's built-in 13 (a text
  prompt; stored separately in `localStorage` as `CUSTOM_DOMAINS`,
  merged into every Domain dropdown alongside Zoho's own list). Doesn't
  touch `ZOHO_TOOLKIT` itself — that stays pure reference data on real
  Zoho products; a custom domain only ever affects pricing categorization
  here.
- **Tool / Edition suggest existing entries as you type** (native
  `<datalist>` combo inputs, refreshed after every add/edit/delete) — so
  adding another pricing tier for a tool that already exists reuses the
  same name instead of risking a near-duplicate from a typo; typing
  something new still just creates it.

**Reference documents (RAG)** — a new upload area at the top of this step
lets you drop in `.md`, `.txt`, or `.json` files. The browser uploads the
raw file to the local server, which chunks it and embeds each chunk via
whichever **embedding provider** is set in Setup — OpenRouter's
`/v1/embeddings` API (default model: `nvidia/nemotron-3-embed-1b:free`) or
a local Ollama model's OpenAI-compatible `/v1/embeddings` endpoint (default:
`nomic-embed-text`), both called the same way under the hood. Results are
written straight into **Qdrant** — a vector database you run yourself
(this app connects to it but doesn't manage it as a child process; see
**Setup** below). Each uploaded file gets three actions in the table:
**Export** (downloads its reconstructed text as a file — reassembled from
its stored chunks, so not necessarily byte-identical to the original
upload, but the same content), **Edit** (opens the same text in a modal;
saving re-chunks and re-embeds it, replacing the old chunks under the same
name), and **Remove** (deletes it entirely). Re-uploading/editing a file
with the same name always replaces its old chunks rather than duplicating
them — this table is always read live from Qdrant, so it looks exactly the
same after closing and reopening the app as it did before, with the same
three actions available on each file, no separate persistence needed.

**Important — embedding model consistency:** whatever embedding model you
had selected in Setup at upload time is baked into those vectors. If you
later switch to a different embedding model, new uploads use the new one,
but *existing* chunks were embedded with the old one — comparing vectors
from two different embedding models is meaningless even if their
dimensions happen to match, since they're different vector spaces. If you
change your embedding model, re-upload your existing documents so
everything in a given collection was embedded consistently.

**Qdrant collections — multi-select.** This app connects to a Qdrant
instance (default: `http://localhost:6333`, set in `server/.env`) that may
hold collections from other projects/scripts too — since Qdrant is a real
running database, not a portable file format. The **"Qdrant collections"**
list at the bottom of the card shows every collection with an item count
and a checkbox; **check as many as you want, and Ask AI searches across
all of them at once**, merging results by relevance. Uploads, the
Reference documents table, and the `tools.json`/`tools.md` lookup (see
below) all still operate on a single **primary** collection at a time —
whichever one you checked most recently (labeled "uploads go here" in the
list) — so a single-collection workflow behaves exactly as a plain
single-select always did; multi-select is purely additive for Ask AI's
search scope. Type a name and hit **Create & switch** to start a new,
empty collection (it's actually created in Qdrant on your first upload to
it, once a vector size is known) — this also makes it primary and adds it
to the search set.

**Interoperable with a companion Streamlit RAG tool (`app.py`).** If you
also use a separate Python/Streamlit ingestion tool against the same
Qdrant instance, this app matches its schema exactly, so both can read and
write the *same* collection interchangeably:
- **Named vector `pro1`** — any collection this app creates fresh uses a
  named dense vector called `pro1` (`DEFAULT_VECTOR_NAME` in
  `server/server.js`), matching that tool's `VECTOR_NAME` constant, rather
  than Qdrant's default unnamed vector.
- **Payload keys `file_name` / `chunk_index`** — not `source`/`chunkIndex`
  — matching that tool's payload shape exactly. (This app's own HTTP API
  still speaks `source`/`chunks` to the browser as before; the translation
  to Qdrant's actual field names happens only server-side, so the frontend
  needed no changes for this.)
- **Payload index** — a `keyword` index on `file_name` is created
  automatically alongside any fresh collection, for fast per-document
  filtering, matching that tool's `create_payload_index` call.

More generally (and this covers *any* pre-existing collection, not just
ones from that specific tool): **named vectors are detected automatically,
per collection.** A pre-existing collection might not use Qdrant's default
*unnamed* vector — some tools create a *named* one instead (possibly
alongside an unrelated sparse vector for hybrid search), and different
collections in the same instance can each use a completely different
shape. Uploading to a named-vector collection using the wrong shape is
exactly what a plain "Bad Request" usually means. The server detects each
collection's real schema the first time it's used (`getVectorConfig` in
`server/server.js`) and matches every upsert/search to it automatically —
nothing to configure. If your embedding model's output size doesn't match
what an existing collection expects, uploads get a clear error naming both
numbers; for the internal `chat_history` collection specifically (used to
log Ask AI conversations), a mismatch is skipped silently with a console
warning instead, since it's a non-essential background log and shouldn't
interrupt getting an actual answer.

**This choice is permanent, not re-detected on every restart.** Which
collections are checked (and which is primary) is written to
`server/kb-config.json` and reloaded on every startup — closing and
reopening the app (or restarting your machine) never resets it or makes
uploaded documents "disappear"; the only thing that changes it is you
explicitly checking/unchecking a collection or hitting **Create & switch**.

**Ask AI (floating button)** — a `✦` bubble sits in the bottom-right corner
on every step. Click it to open a chat panel that answers both general
questions and questions about your uploaded documents: it embeds your
question the same way (whichever embedding provider is set in Setup),
searches Qdrant for the **10** most relevant chunks, and sends your
question (plus any matched context) to whichever chat provider is set
from **Setup**. If nothing relevant is found in the Knowledge Base, it
just answers from general knowledge and says so. Every question and answer
is itself written back into Qdrant (a separate `chat_history` collection),
so past conversations become searchable too.

- **Search all documents ▾** — a live-updating list of every uploaded file
  (checkboxes, multi-select). This scopes retrieval, nothing more: check one
  or more files and your next question(s) only search those documents;
  leave everything unchecked to search the whole active collection as
  usual. Selecting a checkbox never triggers a network call by itself —
  only pressing **Send** does, so nothing costs API credits until you
  actually ask something. The list refreshes automatically whenever a file
  is uploaded, removed, or a different Qdrant collection is activated, so
  it never goes stale.
- **New chat / History** — works like a typical AI chat app: conversations
  auto-save as you go (title = your first message) to the browser's
  `localStorage`, **New chat** starts a fresh one, and **History** lists
  past conversations to reopen or delete. This is local to your browser,
  separate from the `chat_history` collection in Qdrant mentioned above
  (that one is for RAG retrieval; this one is for your own chat sidebar).

**Domain/Tools "Send to AI" now checks `tools.json`/`tools.md`** — upload a
file literally named `tools.json` or `tools.md` through the normal
**Reference documents** dropzone above (there's no separate uploader for
this — it's found purely by filename, so any regular upload named exactly
that works). If either exists in the current primary collection, the
Document step's "Send to AI" button (which checks whether your selected
Zoho tools actually fit the uploaded document) semantically searches it
for each selected tool (top few chunks per tool, not the whole file —
safer for large files and more relevant than dumping everything in) and
includes those excerpts as an authoritative reference: the AI is
instructed to judge each tool's fit against what that file says first,
falling back to the tool's own built-in description only where the file
is silent on it. `tools.json` can be plain JSON (an array/object of tool
entries, however you structure it — it's chunked and searched as text, no
schema required). The **Tool fit** list (below the checklist) shows a
"Fits"/"Differs" verdict with a reason for each. If neither file exists,
this step behaves exactly as before (built-in descriptions only) —
nothing breaks either way.

### Setup — one command, starts everything

**Prerequisite (one-time):** have **Qdrant** running before you start this
app — it connects to it but does not launch or manage it. You're already
doing this with the native Windows binary
(`qdrant-x86_64-pc-windows-msvc\qdrant.exe`, no Docker needed); just run it
in its own terminal and leave it running:

```
D:\qdrant-x86_64-pc-windows-msvc\qdrant.exe
```

You should see the Qdrant banner and `Access web UI at
http://localhost:6333/dashboard` — that dashboard is worth keeping open;
it shows every collection (e.g. `zoho_data`) and lets you inspect points
directly. (Docker `docker run -p 6333:6333 qdrant/qdrant` or Qdrant Cloud
work the same way if you ever switch machines — just update `QDRANT_URL`
in `server/.env`.)

Then, from the **project root** (not `server/`), in a separate terminal:

```bash
npm start
```

That's it — `node_modules` is already bundled in this zip (both root and
`server/`), so there's no `npm install` step needed each time you get an
updated copy. (Only exception: if a future update adds/changes a
dependency in `package.json`, run `npm install` once after that specific
update — I'll call it out explicitly when that's the case.) `npm start`
runs two things together, on any OS:

**Cross-platform note:** the root `package.json`'s scripts call `node
node_modules/concurrently/dist/bin/concurrently.js` and
`node_modules/serve/build/main.js` directly, rather than the plain
`concurrently`/`serve` commands. That's deliberate — npm normally
generates OS-specific launcher shims in `node_modules/.bin/` (`.cmd` files
on Windows, shell scripts on Mac/Linux) the first time you install, but
since `node_modules` here was pre-built once and bundled into the zip
rather than installed fresh on your machine, only one OS's shims would
ever be present. Calling the actual `.js` entry point through `node`
directly sidesteps that entirely — those files are plain JavaScript with
no OS-specific parts, so this works identically on Windows/Mac/Linux
regardless of which platform `node_modules` was built on.

- the **Express API** (`http://localhost:5001`) — Knowledge Base
  upload/search + Ask AI. It connects to Qdrant at `QDRANT_URL` (default
  `http://localhost:6333`, see `server/.env`) and uses the collection
  named by `QDRANT_COLLECTION` (default `zoho_data`) — both overridable, and
  the active collection can also be switched at runtime from the Knowledge
  Base card (see above), which sticks across restarts. If Qdrant isn't
  reachable, `/api/health` reports that clearly rather than the app just
  going dark
- the **static UI** on `http://localhost:3000` — open that in your browser
  instead of double-clicking `index.html` directly, so the page can talk to
  the API above without CORS/`file://` issues

Leave both `qdrant.exe` and `npm start` running in their own terminals
while you use the app; if either the API or Qdrant isn't up, the Knowledge
Base card and the Ask AI bubble will say so. Press `Ctrl+C` in the
`npm start` terminal to stop the API + UI (Qdrant keeps running separately
until you close its terminal too). The Knowledge Base and Ask AI features
also need a working chat/embedding provider set in **Setup** (OpenRouter
key, or a local Ollama server running).

Everything except the Knowledge Base/Ask AI features still works fine by
just opening `index.html` directly, with no server or Qdrant running at all.

## Admin — tabbed: defaults, team, checklist criteria, history

The **Admin** tab is organized into four tabs: **Defaults** (your company
info used in the proposal + GST/validity/payment-split defaults — moved
here from Setup, which now only holds the chat/embedding provider
cards), **Team
members**, **Document checklist criteria**, and **History** (a dropdown
switches between the team/tools/criteria edit-history tables). Add, edit
inline, or delete team members and checklist criteria — changes apply to
new proposals/documents going forward (proposals/checklists already
generated are unaffected). Every change is logged to its own append-only
history table, each showing time, action, name, field, and the old → new
value — so a rate change, for example, is always traceable.

Resuming a Pending draft and saving it again **updates that same draft** rather than creating a duplicate — a draft only turns into a second entry if you deliberately start a new document from scratch.

Every field edit shows **Accept (✓) / Discard (⟲)** on that row once it
differs from the saved value — nothing is written to the master list or
logged to history until you click Accept; Discard reverts the row to its
last saved values. History rows reveal a small delete (✕) button on hover;
clicking it asks for confirmation before permanently removing that entry.

Both the team and tools tables have a **search box** and an **"Arrange
A–Z"** button. New members/tools are inserted alphabetically automatically;
drag the **⠿** handle on the left of any row to reorder by hand, and hit
"Arrange A–Z" any time to snap back to alphabetical order.

**Backup & restore** (Admin): "Export data.json" downloads everything the
app stores — Setup, all master lists, tool descriptions, all edit
histories, every Pending draft, and the current working document — into one
file. "Import data.json" restores from one (this overwrites current data
and reloads the app).

## Workflow

1. **Setup** — just the chat/embedding provider(s) (OpenRouter key and/or
   Ollama, your company details and defaults now live in Admin > Defaults).
2. **Document** — pick Preliminary or Requirement, upload the `.docx`/`.pdf`
   (parsed in-browser and stored automatically), pick a domain/tool below
   Upload, then click "Send to AI" once it lights up green to build the
   15-item checklist and check tool fit (see above).
3. **Team & Tools** — the only manual step. Pick a name from the dropdown and click
   "Add to team" (or "Add someone new" for anyone not on the roster), assign a
   **role** (Project Responsible / Accountant / Co-ordinator / Finance Team —
   Sivaram Sir's role is fixed to CMD), and split hours across Solution Mapping /
   Implementation / Hypercare. Pick a tool, then its edition, quantity and billing
   cycle, and click "Add tool". A live investment preview updates as you go.
4. **Review & Export** — all four readiness items (API key, document, team,
   tools) are required now, not optional; clicking **"Generate proposal"**
   with anything missing pops up a checklist of what to fill in, each with a
   button straight to that step. Once ready, one AI call reads the stored
   document text and returns both the client details (company, contact,
   industry, doc no.) and the full narrative — nothing typed by hand. **Everything
   in the rendered document is directly editable** — click into any heading,
   paragraph, or table cell (including the Investment tables) and type. There's
   also an **"Edit with AI"** box: type an instruction like "shorten section 1"
   or "reword the promise box to sound warmer" and the AI rewrites the live
   document in place. Whatever is currently on screen — hand-edited, AI-edited,
   or untouched — is exactly what gets downloaded: pick **Word (.docx)** or
   **PDF (via print dialog)** from the dropdown and click **Download**. For
   PDF, this opens your browser's native print dialog — choose **"Save as
   PDF"** as the destination. This is deliberate: an earlier image-based PDF
   exporter (rasterize-then-slice) could never fully guarantee text wouldn't
   get cut mid-word at a page break, since it was cropping an image rather
   than reflowing real text. The browser's own print engine paginates real
   text correctly. **Regenerate**
   re-runs the AI call from scratch (it'll warn you first if you have unsaved
   edits); **Reset** clears the draft entirely and takes you back to the "Ready
   to generate" screen (your document, team, and tools stay as they are).
5. **Knowledge Base** — manage Zoho tool pricing/editions (see above). No AI
   call here.

   Note on the Investment tables: they start out populated from Step 3's
   numbers (computed locally in `assets/costing.js` — the AI never sees or
   invents them at generation time), but because everything is editable
   afterward, you can hand-adjust any figure directly in the document before
   exporting if needed.

## Updating the team roster or tool price list permanently

Edit `assets/data.js` — it's a plain JS file with two arrays, `DEFAULT_TEAM`
and `DEFAULT_TOOLS`, generated from your costing sheet (`DEFAULT_TOOLS` is
currently sourced from `pricing.json`). Re-export/convert and regenerate
this file if your baseline pricing changes; day-to-day edits (add/edit/
delete a tool or edition) belong in **Knowledge Base**, not here — those are
local overrides layered on top and are not written back to this file.

## Files

```
index.html            Page shell / layout
assets/style.css       Styling (brand palette matches the reference proposal)
assets/data.js          Embedded team + Zoho tool/edition price list
assets/state.js         App state + localStorage persistence
assets/parseDoc.js      In-browser .docx/.pdf text extraction
assets/costing.js       All costing math (deterministic, no AI)
assets/openrouter.js    Chat model calls (OpenRouter or Ollama): full-proposal generation + AI-edit command
assets/docxExport.js    Builds a Word-openable .doc directly from the live edited document
assets/pdfExport.js     Triggers the browser's print dialog (real text pagination, not a raster image)
assets/masterData.js     Editable team/tools master lists + edit-history logs (Admin/Knowledge Base)
assets/criteria.js       Editable 15-item document checklist master list + edit-history log (Admin tab)
assets/zohoToolkit.js    Embedded Zoho domain/tool reference data for the Document step's picker
assets/toolDescriptions.js  Per-tool description data (6 sections) -- grounding data for the Send to AI tool-fit check; no in-app editor currently, edit the seed directly
assets/backup.js         Export/import all app data as data.json
assets/pending.js        Save-for-later draft storage (Pending tab)
assets/knowledgeBase.js  Uploads/lists/deletes Knowledge Base reference docs via the local server
assets/askAi.js          Floating "Ask AI" bubble (general + document Q&A via the local server)
assets/main.js          UI wiring, WYSIWYG editing, live-edit capture, Q&A/Pending/Admin logic

server/server.js        Express API: chunks + embeds uploads, connects to Qdrant for storage/search, proxies Ask AI to the configured chat provider
server/package.json     Server dependencies (`node server.js` — orchestrated by the root package.json's `npm start`)
server/kb-config.json   Persisted active Qdrant collection choice (gitignored) — survives restarts, only changes when you explicitly switch/create a collection
server/.env             Local config (gitignored) — QDRANT_URL, QDRANT_COLLECTION
server/.env.example     Documented template for server/.env
package.json            Root: `npm start` runs the API + the static UI together (node_modules pre-bundled, see Setup)
```

## Notes / limitations

- PDF text extraction is layout-naive (no OCR) — scanned/image PDFs won't
  extract text; use a `.docx` or paste text manually in that case.
- The model can only follow the reference format as well as your prompt and
  preliminary notes support it; always review Step 5 before sending a
  proposal out.
- No backend database or accounts beyond the local Knowledge Base API —
  this is meant to be a personal/team tool run locally, not a public-facing
  multi-user product.

## Streaming

Every place this app calls a chat model streams the response as it's
generated, instead of waiting for the whole thing:

- **Ask AI** streams token-by-token straight into the chat bubble, the same
  as any modern AI chat UI — the answer visibly types itself out. This goes
  through the local server as Server-Sent Events (`/api/ask` sets
  `Content-Type: text/event-stream`; `assets/askAi.js` reads it with
  `response.body.getReader()`), since that endpoint also does retrieval and
  Q&A logging around the actual chat call.
- **Send to AI, "Questions you might have missed," Generate proposal, and
  AI edit** all return structured JSON or HTML rather than a chat message,
  so streaming raw partial JSON/HTML into the UI would just look broken —
  instead, their status line updates live with a growing character count
  ("Analyzing — 1,240 characters generated so far...") as the response
  streams in server-side, so it's clear something is actively happening
  rather than a frozen spinner. These calls go straight from the browser to
  OpenRouter/Ollama (`assets/openrouter.js`), unchanged from before.

**A crashed local Ollama backend gets one automatic retry.** If Ollama's
`llama-server` process dies mid-request (`exit status 0xc0000409` /
`CUDA error: shared object initialization failed` and similar — almost
always a GPU/driver issue, not something this app can fix directly), both
the browser-side and server-side code notice that specific failure pattern
and retry once after a short pause, since Ollama typically respawns the
crashed subprocess on the next request. If it crashes again right away,
you get a clear message suggesting concrete next steps (update NVIDIA
drivers, restart Ollama, force CPU mode with `OLLAMA_NO_CUDA=1`, or try a
different model) instead of a raw stack-overrun dump.

**Large files retry automatically, per batch.** A big `.md` file (tens of
thousands of lines) can mean thousands of chunks, embedded in batches of 32
— hundreds of sequential requests to OpenRouter/Ollama for one upload. Any
single one of those can hit a transient network blip (`ECONNRESET`, "fetch
failed", etc), which used to fail the entire upload partway through. Every
batch now gets up to 5 retry attempts with a short backoff between them
(`fetchResilient` in `server/server.js`) before actually giving up, and the
server's own request timeout is disabled so a multi-minute upload doesn't
get killed by Node itself while it's still working. The server's terminal
logs progress every 10 batches on large uploads (`Embedding progress: batch
40/216...`) so you can see it's still going — the browser's own progress
bar just shows an indeterminate "Embedding..." state for this phase, since
there's no clean way to stream batch-level progress back to it yet.

**Storing a large file's vectors is also batched.** Separately from
embedding, writing thousands of points into Qdrant in one `upsert` call can
exceed Qdrant's own payload limit (400 Bad Request: `"JSON payload (...) is
larger than allowed (limit: 33554432 bytes)"`) — a few thousand chunks,
each carrying a full vector plus its text, adds up past 32MB fast.
`upsertPointsInBatches` (`server/server.js`) splits storage into batches of
300 points, with the same retry behavior as embedding, plus an adaptive
fallback that halves a batch and retries if it's somehow still too large
(e.g. unusually long individual chunks) — you shouldn't need to think about
any of this; a huge file just works, in more, smaller requests instead of
one giant one. The terminal logs its own progress the same way
(`Storing progress: batch 10/12...`).

**Emoji/astral characters no longer corrupt an upload.** Chunking used to
slice text purely by character index, which could land exactly between the
two UTF-16 halves of an emoji or other astral-plane character (📄 and
similar are very common as bullets/icons in FAQ-style docs) — the resulting
lone surrogate gets escaped by `JSON.stringify` in a way that can't be
validly re-encoded to UTF-8 bytes, which Qdrant's Rust JSON parser then
rejects as `"Format error in JSON body: unexpected end of hex escape"`.
Chunk boundaries now nudge forward a character rather than split a pair
(`safeSliceEnd`), and any lone surrogate that somehow still shows up gets
stripped as a safety net (`stripLoneSurrogates`) — both in
`server/server.js`. A document full of emoji uploads cleanly now.

**A real progress bar, not a spinner.** Uploads now stream progress back
from the server as Server-Sent Events instead of returning one response at
the very end — the bar reflects actual batch counts for both phases
(embedding 0-70% of the bar, storing into Qdrant 70-100%), e.g. "Embedding
'file.md'... 1,280/3,577 chunks (batch 40/112)". No more guessing whether
a large upload is still working or has silently stalled.

**Cancel button while uploading.** A **Cancel** button appears next to the
progress bar for the duration of an upload. Clicking it aborts the
in-flight request (`AbortController` client-side); the server detects the
dropped connection and stops making further embedding/storage calls at the
next opportunity rather than continuing to burn API calls for a result
nobody wants anymore. Whatever chunks were already stored before
cancelling stay in Qdrant (partial upload) — re-upload the same file to
replace them cleanly.

**Advanced upload settings.** An **"Advanced upload settings ▾"** toggle
under the dropzone exposes four optional overrides, useful if a large file
still fails for its own reasons (very large individual paragraphs, an
unusually slow embedding provider, etc): **chunk size**/**chunk overlap**
(characters per text chunk, default 900/150) and **embedding
batch size**/**Qdrant storage batch size** (items per request, default
32/300). Leave any of them blank to use the default — most files never
need to touch these.

**Ask AI was silently answering from general knowledge only, for a
while.** The Qdrant client version bundled here (1.19.x) renamed its
`search()` method to `query()`, with a different parameter shape (`query`
instead of `vector`, a separate `using` field for named vectors instead of
nesting it, and a response wrapped in `{points: [...]}` instead of a bare
array). Calling the old `search()` name against this version fails with
`"qdrant.search is not a function"` — caught internally as "the KB query
failed for this collection," which the app already handled by falling back
to general knowledge, so answers still came back but were never actually
grounded in anything you'd uploaded. Every call site now uses `query()`
with the correct shape (`queryPoints` in `server/server.js`), including for
named-vector collections. If you're not sure whether your own answers were
affected by this, ask something specific to your uploaded content and
check the response mentions "(Sourced from: ...)" at the end — that only
appears when retrieval actually found and used something.

## Document step performance and cross-linking with Knowledge Base

**"Send to AI" is now one LLM call instead of two.** Checklist analysis,
tool-fit verdicts, and both "Questions you might have missed" sections
(general + tool-related) used to be two separate full-document round trips
(the second auto-chained right after the first) — now they're one combined
call (`analyzeDocumentChecklist` in `assets/openrouter.js`), reading the
document once and producing everything together. The "Re-generate" button
on the Questions card still works independently afterward if you want
fresh questions without re-running the whole checklist. The per-tool
reference-document search (grounding tool-fit against an uploaded
`tools.json`/`tools.md`) also used to run one request at a time per
selected tool — now all of them fire in parallel (`Promise.all` in
`assets/knowledgeBase.js`), which matters more the more tools you have
selected.

**Tool fit results now actually survive "Save for later."** They were
never included in the saved pending-draft data at all, and were
unconditionally cleared when resuming a draft — so tool-fit was silently
lost on every single save, not just when a tool got removed first. Both
the save and resume paths now carry `toolFit` through correctly.

**Document step's Domain/Tool dropdowns now come from Knowledge Base.**
`assets/main.js`'s `populateDomainSelect`/`populateDomainToolSelect` read
straight from the priced master list (`MASTER_TOOLS`, i.e. Knowledge
Base's "Zoho tools & editions") instead of the fixed `ZOHO_TOOLKIT`
reference data — add or edit a tool's Domain there and it shows up here on
your next visit to the Document step, no separate sync step. Rich
AI-facing tool descriptions (used to ground the tool-fit check) still
resolve correctly against `ZOHO_TOOLKIT` where a name matches it
(`zohoToolInfo` is now tolerant of the master list's "Zoho X" naming vs.
the toolkit's bare "X" keys).

**Domains and roles are fully customisable — not just additions on top of a
fixed list.** Both the Domain field (Knowledge Base's "Zoho tools &
editions") and the Role field (Admin's Team Members) are backed by
`localStorage` lists (`CUSTOM_DOMAINS`, `CUSTOM_ROLES` in
`assets/masterData.js`) seeded *once* from the built-ins (Zoho's own 13
domains; the 4 default roles) the very first time the app ever loads —
from then on, that stored list is the sole source of truth. "+ New
domain"/"+ New role" adds to it; the "Manage domains"/"Manage roles"
panels list *everything* (not just what you've personally added) with a
Remove button on each, including the originally-seeded entries — genuinely
nothing is protected. If a tool or team member still references a domain/
role you've since removed, it keeps showing that value in its dropdown
(marked "(removed)") rather than silently reverting to blank, so no data
is lost — just re-pick something once you notice.

**"+ Add / Edit tool" panel.** The tool add-row in Knowledge Base is now a
collapsible panel (matching the "Advanced upload settings" pattern) with
Tool and Edition as searchable combo inputs (`<datalist>`, suggesting
existing entries as you type — so adding another pricing tier for a tool
that already exists reuses the same name).

**Tool-fit grounding now searches your whole Knowledge Base, not one
magic filename.** The Domain/Tools "Send to AI" check used to only look
for a file named *exactly* `tools.json` or `tools.md` to ground its
tool-fit verdicts — a real reference upload with any other name (e.g.
`final_tool_description.md`) was invisible to it purely because of its
filename. It now does a semantic search across every active Knowledge
Base collection for each selected tool, picks up whatever's actually
relevant regardless of filename, and cites the real source file(s) in its
reasoning. `/api/kb/search` (`server/server.js`) was also upgraded to
search across every checked collection and merge results by relevance,
matching how Ask AI's multi-collection search already worked.

## Document sections in Knowledge Base

Reference documents are now organized into named **sections** instead of
one flat file list — each rendered as its own card with a ready/not-ready
status light (green if it has at least one document, red if it's still
empty) and its own mini-table.

- **Seeded once** with three starter sections (Zoho Book FAQ, Zoho Book
  Help, Zoho Tool Description) plus a built-in catch-all, **Additional
  documentation**, for anything not explicitly assigned — same seed-once,
  fully-mutable pattern as domains and roles (`CUSTOM_DOC_SECTIONS` in
  `assets/masterData.js`). "+ New section" adds more; the "Manage
  sections" panel removes any of them (the catch-all itself can't be
  removed — everything needs somewhere to land).
- **Pick a section before uploading** — a dropdown next to the dropzone
  sets which section a new upload goes into. Already-uploaded files can be
  **moved between sections at any time** via a small dropdown right in
  their row (no re-upload needed — `POST
  /api/kb/documents/:source/section` in `server/server.js` updates the
  `doc_section` field on every existing chunk in one filtered Qdrant
  request via `setPayload`). Editing a file's content (the existing Edit
  button) keeps it in whatever section it was already in.
- **This is a new field, so it only applies going forward.** Files
  uploaded before this feature existed have no `doc_section` value stored
  in Qdrant yet, so they'll show up under "Additional documentation" by
  default — move them to their proper section once via the row dropdown
  and that's it, no re-uploading needed.
- Not part of the `app.py` interop schema documented earlier — it's purely
  an organizational label this app adds on top (`doc_section` payload
  field), ignored harmlessly by anything else reading the same Qdrant
  collection.

## Ask AI: real conversational memory, and a context-length setting for Ollama

**Follow-up questions now actually work.** Ask AI used to treat every
question as a fresh, isolated one — embedding only the literal text you
typed for retrieval, and sending the model just that one question with no
memory of anything said before. A vague follow-up like "explain them
fully" or "what about pricing?" carries almost no signal on its own, so
retrieval was pulling in whatever loosely matched those generic words
across the whole Knowledge Base, and the model had no idea what "them"
referred to — producing exactly the kind of unrelated-summary answer this
was designed to avoid. Fixed in `server/server.js`'s `/api/ask`: the last
couple of turns are now folded into the retrieval query (so a follow-up
searches for the right thing), and the actual prior conversation is sent
to the model as real message history, not just the current question in
isolation.

**History dropdown arrow.** The Ask AI panel's "History" button now shows
a ▾/▴ arrow that flips to reflect whether the dropdown is actually open,
consistently from whatever closed or opened it (its own click, the
Documents toggle closing it, starting a new chat, or picking a chat from
the list).

**Admin > LLM Context (Ollama only).** A new Admin tab lets you raise
Ollama's context window (`num_ctx`) — it defaults to a small window
(often 2-4K tokens) regardless of what the model actually supports, and
silently truncates anything beyond it rather than erroring, which is the
usual cause of a local model seeming to "forget" earlier parts of a long
document or conversation. Applies to every Ollama call this app makes
(Ask AI, Send to AI, question generation, proposal generation, AI edit);
**never applied to OpenRouter**, which manages its own context server-side
and has no such cap to configure. One honest caveat, stated in the UI too:
Ollama's own documentation says its OpenAI-compatible endpoint doesn't
support setting context length this way (the documented route is a custom
Modelfile) — this is sent as a top-level `num_ctx` field alongside the
normal request on the chance a recent Ollama version honors it as an
extension anyway, since unrecognized fields are otherwise harmlessly
ignored either way. If it doesn't seem to be taking effect, updating
Ollama is worth trying first.

## Fixing confidently-wrong Ask AI answers (RAG grounding)

A retrieved procedure/section can end up only half-complete purely because
of where a chunk boundary happened to fall — and a model asked to answer
from an incomplete excerpt will often "helpfully" fill the gap using its
own trained knowledge of the product instead of saying the context looks
incomplete, producing a fluent, confidently-stated, and *wrong* answer
(e.g. describing a similar-sounding but different procedure than the one
your document actually documents). Three changes address this:

- **Neighbor-chunk expansion** — for the top few retrieved matches,
  `/api/ask` now also fetches their immediate neighboring chunks (same
  document, `chunk_index ± 1`) via a direct Qdrant filter lookup, so a
  procedure split across a chunk boundary gets reassembled before it ever
  reaches the model. This applies to **already-uploaded documents
  immediately** — no re-upload needed, since it works off `chunk_index`
  regardless of how large the original chunks were.
- **Larger default chunk size** — 900/150 characters (chunk size/overlap)
  was small enough that a single procedure (header + steps + notes) could
  easily land right on a chunk boundary. Raised to 1500/250 by default.
  This only affects **new uploads** going forward; to benefit an existing
  document, re-upload it (the "Advanced upload settings" panel lets you
  set a custom chunk size per upload too, if 1500 still isn't enough for
  a particularly dense document).
- **Much stricter grounding rules in the prompt** — explicitly forbids
  supplementing retrieved context with the model's own trained knowledge
  of the product/topic ("if the context conflicts with what you know, the
  context wins, always"), requires preserving exact steps/button names
  from the context rather than paraphrasing them from memory, and
  instructs the model to say so explicitly if the retrieved context looks
  incomplete rather than quietly completing it itself.

## Detailed Requirement Document (DRD) flow

Selecting **"Detailed Requirement Document"** as the document type in the
Document step switches to a separate, simpler flow — a DRD is already
detailed enough that the checklist/tool-fit/missed-questions machinery
(built for a lighter preliminary document) doesn't add value:

- **Domain/Tools, the 15-item checklist, and missed-questions are hidden
  entirely** for this document type — nothing to pick, nothing to send to
  AI first. Once text is extracted (upload or paste), a single **"Proceed
  to Review & Export"** button appears.
- That takes you to **Review & Export**, which now shows the DRD text
  itself as a fully editable document (direct editing, or "Edit with AI"
  — the same `applyAiEdit` used everywhere else in the app), plus **"Save
  for later"**.
- From there, two independent buttons: **"Generate Proposal"** (reuses the
  existing proposal generation/template/editing/export pipeline
  completely unchanged — it only ever depended on the document text, never
  on the checklist or domain/tools) and **"Generate Scope of Work"** —
  same architecture as the Proposal (structured JSON from the AI,
  deterministic HTML template, same `doc-title`/`meta-table`/`sec`/
  `subsec`/`data`/`callout` CSS classes, so both documents look, edit, and
  export identically): a title page (Document No, Version, Client, Primary
  Contact, Submitted by, Date, Reference Proposal), Purpose, a
  lettered/numbered **Scope of Work** table (A, B, C... groups of concrete
  deliverables), numbered **Exclusions** and **Client Dependencies**
  subsections, an **Investment** section reusing the exact same costing
  data as the Proposal (never AI-generated pricing), **Timeline**,
  **Notes**, **Conclusion**, and an **Acceptance**/signature block —
  calibrated against real reference DRD/Proposal/SOW documents rather than
  guessed. Both documents are fully editable the same way, each with their
  own Word/PDF export dropdown.
- **The two documents stay consistent with each other automatically** —
  whichever of Proposal/Scope of Work is generated first fills in the
  client company/contact fields for the other (same non-destructive
  "only fill if still empty" pattern used elsewhere in this app), and the
  Scope of Work's title-page tagline matches the Proposal's once both
  exist.
- **"Save for later" saves everything together** — the DRD text and
  whatever's been generated so far for the Proposal and/or Scope of Work,
  all in one snapshot, rather than three separate save actions.

## Pending tab: real filenames, search, and date filtering

- **The actual uploaded filename is now the label** (e.g. `Bilda Packs
  DRD.docx`) instead of a generic "Untitled document" fallback — falls
  back to the client company/contact name, then "Untitled document", only
  if no file was ever uploaded (e.g. pasted text). Duplicate filenames are
  fine and untouched — the timestamp already shown on each card
  differentiates them.
- **Search** (by filename/label or client company) and a **From/To date
  range filter**, both live-filtering the list as you type/pick dates. "No
  pending drafts match your search/filter" shows when the filters exclude
  everything, distinct from the genuinely-empty-list message.
- **Fixed a real bug along the way:** resuming a saved draft used to
  unconditionally discard any already-generated Proposal (and Scope of
  Work) rather than restoring it — "Save for later" saved it, but
  "Resume" silently threw it away. Both directions now correctly carry
  the uploaded filename, the generated Proposal, any manual/AI edits to
  it, and the generated Scope of Work.

## Custom API — any OpenAI-compatible provider

Beyond OpenRouter and Ollama, both the Chat model and Embedding model
cards in Setup now have a third option: **"Custom API"** — any provider
that speaks the OpenAI-compatible `/chat/completions` and `/embeddings`
shape (Groq, Together.ai, Fireworks, Azure OpenAI, a self-hosted
vLLM/LM Studio server, etc.).

- A shared **"Custom API server"** card (shown once either role is set to
  it, same pattern as the Ollama card) holds the **Base URL** and **API
  key** — requests go to `{Base URL}/chat/completions` and
  `{Base URL}/embeddings`. Each role (chat/embedding) has its own **model
  id** field, since a provider's chat and embedding models are usually
  named differently even under the same account.
- Chat and embedding can each independently be OpenRouter, Ollama, or
  Custom API — e.g. Groq for chat, OpenRouter for embeddings, all at once.
- **"Test connection"** for Custom API sends a real 5-token
  `/chat/completions` request and reports success/failure directly,
  same as the OpenRouter and Ollama test buttons.
- Server-side, `resolveChatProvider()` in `server/server.js` and the
  equivalent branch in `assets/openrouter.js` handle all three providers
  through the same code path — Custom API behaves exactly like OpenRouter
  (needs a key, sent as `Authorization: Bearer`) except pointed at your
  own base URL instead of a fixed one.
- Stored as `customApiUrl`/`customApiKey`/`customApiChatModel`/
  `customApiEmbedModel` in Setup (`localStorage`), same persistence as
  every other Setup field.

## PDF export was silently dropping content — fixed, plus an automated verifier

**Root cause, confirmed by comparing screenshots against the code:** the
new Scope of Work template (above) introduced real `<ul>`/`<li>` bullet
lists for Exclusions and Client Dependencies — something the previous
Proposal template never used (it rendered numbered points as plain
`<p>` text instead). `domToPdfContent` in `assets/pdfExport.js`, which
walks the on-screen document and maps each element into pdfMake's format
for the PDF, had no case for list tags at all — anything it doesn't
recognize is just silently skipped (`if (!item) return;`), so those whole
sections vanished from the PDF while still showing correctly on screen
and in the Word export (which just wraps the same HTML directly, no
re-parsing). Added proper `<ul>`/`<ol>` handling (`pmList`), so this
specific gap is fixed.

**Automated completeness verifier**, so a future template change that
introduces some other tag type doesn't repeat this silently: every PDF
export now runs `verifyPdfCoverage()` right before download — it extracts
every word actually included in the PDF's content array and compares it
against the on-screen document's own text, word for word. If coverage
drops below 97%, you get a toast warning naming the actual percentage
before you send anything out, plus a console log with a sample of exactly
which words didn't make it in — rather than finding out from a client. Not
worth doing for the Word/.docx export: unlike PDF, it embeds the exact
same HTML directly with no re-parsing step, so it's complete by
construction — there's nothing meaningful to verify there.

## Document banners

Both generated documents now open with a bold banner — white text on a
green background — identifying the document type at a glance:
**"PROPOSAL DOCUMENT"** at the top of the Proposal, **"SCOPE OF WORK
DOCUMENT"** at the top of the Scope of Work (`.doc-banner` in
`assets/style.css`/`assets/docxExport.js`'s `DOCX_STYLE_BLOCK`, with a
dedicated `pmBanner()` handler in the PDF exporter so it renders correctly
there too, rather than repeating the exact class of bug just described).

## Document formatting now matches your real Proposal/SOW exactly

**The green banner moved out of the document.** "PROPOSAL DOCUMENT" /
"SCOPE OF WORK DOCUMENT" is now a UI-only section label sitting above each
preview area in the app (`.doc-section-banner` in `assets/style.css`) —
telling you which section you're looking at, not something that gets
exported. It's explicitly excluded from PDF generation and hidden in
print/export CSS, so it never appears in the actual Word/PDF file.

**Real format extracted from your reference PDFs**, not guessed —
rendered both documents to images and pulled the actual embedded logo out
of the PDF directly (`assets/logoData.js`, base64-embedded so it works
identically in the on-screen preview, Word export, and PDF export with no
file path to break):

- **The real Satsang Solutions logo** on the title page of both documents.
- **A running header band** — "PROPOSAL | {Client}" or "SCOPE OF WORK |
  {Client}" on the left, company name on the right, green rule beneath —
  matching your SOW's actual header exactly. Built as an HTML table
  rather than flexbox, since Word's HTML renderer doesn't reliably support
  flexbox — this way it lays out correctly in the browser, Word, and PDF.
- **A footer band** — tagline (new `providerTagline` setting in Setup,
  defaults to "Structure . Systemize . Scale . Succeed." but fully
  editable, not hardcoded) and document number, green rule above.
- **Scope of Work's lettered groups now render as merged dark-green header
  bars** (e.g. "A. Organisation Setup & Configuration" as one solid-green
  cell) sitting flush above a numbered items table — matching your real
  document's table structure exactly, replacing the generic "#/Deliverable"
  column-header table used before.
- **PDF export gets genuine per-page repeating headers/footers** — the
  one format that's actually paginated, so it's the most faithful
  reproduction of your reference PDFs' every-page treatment. Built with
  pdfMake's native `header()`/`footer()` callbacks, reading the real text
  straight out of the on-screen header/footer bands (including edits)
  rather than being hardcoded separately, so the PDF can never drift out
  of sync with what's on screen.
- All of this is wired into the same content-completeness verifier from
  above (`pmGroupHeader`/`pmItemsTable`/logo image all have proper PDF
  export handlers) — the exact class of "silently dropped from the PDF"
  bug that started this couldn't quietly happen again here.

## Unified workflow: Document → Detailed Requirement Document → Team & Tools → Generate

The whole document-to-deliverable flow was restructured so both entry
points (a Preliminary Requirement Document, or a Detailed Requirement
Document entered directly) converge on the same downstream path:

1. **Document (step 2)** — upload/extract text.
   - **Preliminary flow**: Domain/Tools → 15-item checklist → missed
     questions, same as before. Once the checklist has run, a **"Create
     Detailed Requirement Document"** card appears — clicking it opens a
     popup with three options: **Create Detailed Requirement Document**
     (folds the preliminary document plus every agreed checklist answer
     and answered question into a proper DRD via AI), **Save for later**,
     or **Cancel**.
   - **Detailed Requirement Document (direct entry)**: the extracted/typed
     text *is* the DRD — no AI step needed, no separate checklist/tool-fit
     (removed the old explanatory card and "Proceed to Review & Export"
     button entirely, per feedback that they didn't belong here).
   - Either way, once a DRD exists it shows in the same **editable
     preview** (direct edits or AI-edit, exactly the editing pattern used
     elsewhere in the app) with **"Proceed to Team & Tools"** and **"Save
     for later"**.
2. **Team & Tools (step 3)** — unchanged, plus a new **"Proceed to
   Generate Proposal & SOW"** button at the bottom.
3. **Review & export (step 4)** — now opens with a **preview of the DRD
   and the Team & Tools selections together** (read-only summary, with
   "Edit in Document/Team & Tools step" shortcuts back), followed by
   **"Generate Proposal"** and **"Generate Scope of Work"** — each fully
   editable with its own Word/PDF export dropdown, exactly as before.

Both **Generate Proposal** and **Generate Scope of Work** now read from
`STATE.drdText` (the finalized DRD) instead of the raw preliminary text —
the DRD step is genuinely load-bearing now, not just a formatting detour.

**Also fixed while restructuring this:**
- **Reset document** now also clears the Domain/Tool selections and
  missed-questions Q&A (previously only cleared the document text and
  checklist, leaving stale domain/tool picks and questions behind).
- **Tool-related questions occasionally not showing** — two contributing
  fixes: the combined analysis call's JSON schema had `toolQuestions` as
  the *last* key, generated after the large 15-item checklist and every
  other section — the first thing to go missing if the response ran long.
  Reordered so the smaller, easier-to-drop question lists are generated
  first (with an explicit instruction that they must be complete even if
  it means keeping checklist answers brief), and raised the token budget
  for headroom. On top of that, added an automatic backfill: if tool
  questions still come back thin (fewer than 3), a lightweight follow-up
  call tops them up automatically rather than silently showing nothing.

## Stale drafts, missing Save button, and logo management

- **"Save for later" was missing from Review & Export** — added, next to
  the Generate buttons.
- **Stale Proposal/SOW drafts lingering after starting a new document** —
  root cause: "Reset document" was deliberately designed to *preserve*
  any already-generated Proposal/SOW (by original request). That's now
  reversed per updated requirements: Reset document clears the document
  text, Domain/Tools, checklist, questions, the Detailed Requirement
  Document, *and* any generated Proposal/SOW. "Save for later" and
  "New proposal" already cleared everything correctly.

**Company logo, verified and updated** — extracted your new logo
(`newlogo.jpeg`) and its updated tagline ("Structure . System . Scale .
Success"), auto-fit (aspect-ratio preserved, never stretched/cropped) and
baked in as the new default (`assets/logoData.js`).

**Admin → Logo tab** — upload a new logo any time without editing code:
shows the current logo, lets you pick a new file (auto-fit preview before
committing anything), "Accept" to commit it, and "Revoke changes" to
restore the previous one (one-step undo, kept in
`STATE.settings.previousCompanyLogo`). The resize happens entirely
client-side via canvas — never upscales a smaller image, only ever
shrinks a larger one to fit, preserving aspect ratio exactly.

**Client logo (Review & Export)** — optional, same auto-fit upload
pattern, sits right above the Generate Proposal/Generate Scope of Work
buttons, with "Select another image" and "Remove". Appears in the
top-left of both generated documents, opposite the company logo (top-
right) — both now sit in a shared two-column logo row
(`assets/main.js`: `.doc-logo-row`) instead of the company logo being the
only one. In PDF export specifically, both logos are genuine per-page
repeating elements (via pdfMake's header function, matching how the real
reference PDFs show the logo on every page) rather than appearing once at
the top of page 1.

## Document structure grounded in your actual formats

Added `assets/documentFormats.js` holding two things you supplied
directly, used to steer generation rather than being fully free-formed:

- **The curated general-questions bank** (`General_questions.txt`,
  organized by topic: Organization & Scale, Current State & Existing
  Tools, Users/Roles & Access, Commercial & Timeline, Integration &
  Technical, Support/Training & Change Management). Both the combined
  Send-to-AI analysis and the standalone "Re-generate" button now check
  every bank question against the document first and only surface the
  ones genuinely missing, instead of the model free-generating its own
  list from scratch — so the same core discovery questions get asked
  every time, consistently.
- **The four document types' section structures** (`document_contents.md`
  — PRD, DRD, Proposal, SOW) — referenced as structural guidance in the
  DRD generation prompt (organizes around these section names, skipping
  any the source material doesn't support) and as content-inspiration
  references in the Proposal/SOW prompts (their existing schemas, already
  matched closely to your real reference PDFs, stayed as the fixed
  structure rather than being rebuilt from this more granular list).
- **Exception-aware checklist judging** — conditional sections (Hardware
  Requirements, Software Requirements, Infrastructure Requirements, Data
  Migration) are now reasoned about explicitly rather than mechanically
  flagged as gaps: a software-only/cloud engagement genuinely has no
  hardware section to write, so its absence isn't treated as missing
  information — but if the document *does* describe physical
  equipment/on-prem infrastructure without documenting its requirements,
  that's still flagged as a real gap. Where an exception is applied, the
  checklist item's answer says so explicitly (e.g. "Not applicable — this
  is a software-only engagement...") rather than just looking unanswered.

**Honest scope note:** this went in as prompt-level guidance grounding
the *existing* generation pipeline in your real reference material, not
as four entirely new bespoke document templates built from the full
~130-line-item combined structure in `document_contents.md`. The Proposal
and SOW templates in particular were already calibrated against your real
reference PDFs in an earlier round and are working well — I didn't want
to risk breaking that by forcing a much larger, untested schema onto them
in the same pass. If specific sections from that fuller structure are
missing from what gets generated in practice, flag which ones and they
can be added deliberately rather than all at once.

## Linear navigation, save-for-later everywhere, and the sidebar fix

- **Prev/Next arrows** at the bottom of each of the 4 main steps (Setup →
  Document → Team & Tools → Review & Export) for a clear linear path,
  purely additive — every step still stays directly reachable via the
  sidebar rail, same as before. Pending and Admin are deliberately left
  out of this chain.
- **"Save for later" is now on every main step**, not just Document —
  added it to Team & Tools (it was already on Document's Q&A section, the
  DRD review, and Review & Export from earlier rounds).
- **Sidebar "half side tab" structure fix** — found the actual cause:
  below 860px width, the CSS was flipping the *entire* sidebar (brand
  name, all 5 steps, Pending/Admin, the footer) into one horizontal
  flex-wrapping row, cramming everything into a single chaotic inline
  flow — exactly the "non-structured" jumbled text described. Fixed to
  stay a properly structured vertical list at any narrower width, just
  more compact, with an additional breakpoint for genuinely tight spaces
  (e.g. a "half" split-screen window) that shrinks sizing further without
  ever reverting to the horizontal-wrap layout. This was a static CSS
  rule, not a JS collapse toggle, so it was breaking consistently on every
  click/navigation while narrow — the fix should hold regardless of
  interaction.

## Round: combined DRD+solutions call, formatted DRD, logo sizing, PDF coverage

- **Solution suggestions no longer a separate AI call.** They now come back
  from the same call that builds the Detailed Requirement Document
  (`generateDrdAndSolutions`) — both read the identical source material, so
  splitting them was doubling cost and latency for nothing.
- **Web-search toggle removed.** Models that ground in live web results do
  so natively; the app no longer tries to force it on with a `:online`
  suffix or ask you to opt in. Previous Solutions documents are compared
  against the model's own knowledge when both are available, which is what
  actually mattered.
- **The DRD is now a properly formatted document**, not raw prose — same
  logo row, header/footer bands, title page, meta table and CSS classes as
  the Proposal and SOW, built from structured JSON through `buildDrdHtml`.
  Its plain-text form (`drdStructuredToText`) is what downstream Proposal/
  SOW generation reads, kept in sync automatically as you edit.
- **Logo sizing in Word/PDF fixed.** Root cause: Word's HTML renderer
  ignores CSS `max-width`/`max-height` on images, so logos rendered at full
  natural size. Uploaded logos now store their real pixel dimensions, and
  templates emit explicit `width`/`height` attributes (`logoRowHtml`/
  `logoDisplaySize`). The PDF header uses each logo's own width rather
  than one fixed size for both, so differently-shaped client and company
  logos stay correctly proportioned.
- **Green headers no longer turn invisible when clicked to edit.** The
  generic contenteditable focus style set a pale background, which left
  white-on-green header cells as white-on-near-white. Those cells now keep
  their dark fill when focused.
- **Missing SOW Conclusion fixed.** `conclusionBody` was the last key in
  the schema, so it was the first thing lost when a response ran long —
  same failure mode as the earlier tool-questions bug. Notes and Conclusion
  now generate early in the schema, with a raised token budget and an
  explicit instruction that they must never be dropped. If they still come
  back empty, the template shows an editable placeholder rather than a bare
  heading.
- **PDF "~86% coverage" warning was a false positive.** The header/footer
  bands and logo row are deliberately excluded from the PDF content array
  because they're rendered as genuine per-page pdfMake header/footer
  elements — but the verifier was still counting their words as missing.
  It now excludes them from the comparison, so the warning only fires on
  genuinely dropped content.
- **Custom API is now flexible.** A provider-preset dropdown (OpenAI, Groq,
  Together, DeepSeek, Mistral, Fireworks, Perplexity, Gemini, xAI, LM
  Studio, vLLM, or Other) fills the Base URL automatically, and everything
  stays editable — covering providers that give you only a key, a key plus
  a model id, or a full base URL as well.

## PDF logo alignment and Word logo sizing — root causes found and fixed

**PDF: both logos bunched on the left instead of client-left/company-right.**
Root cause: the per-page header gave each logo's column a *fixed* width
sized exactly to that image, leaving no spare room for `alignment` to
actually push it anywhere — both logos just sat left-packed regardless of
the alignment setting. Fixed by giving each column `width:'*'` (splitting
the full page width in two) with the image's `alignment` set on the image
node itself, nested inside. Verified with a real pdfMake render (not just
reasoning about the API) — client logo now sits at the far-left page edge,
company logo at the far-right, confirmed by rendering the test PDF to an
image and inspecting it directly.

**Word: logos rendering oversized despite correct on-screen sizing.**
Root cause: Word's HTML-import path doesn't reliably treat bare
`width`/`height` attributes on `<img>` as browser-style 96dpi pixels — the
exact pixel values that render correctly on screen and in the PDF export
came out oversized in Word specifically. Fixed by adding an explicit
inline `style="width:Xpt;height:Ypt;max-width:Xpt"` (point units, which
Word's importer respects consistently) alongside the existing pixel
attributes, and removed a now-redundant fixed-size rule from the DOCX
stylesheet that could have conflicted with it.

## OmniRoute

"Custom API" in Setup is now "OmniRoute" throughout — an open-source,
self-hosted gateway (`npm install -g omniroute`) giving one
OpenAI-compatible endpoint in front of 260+ providers with automatic
fallback. Defaults to its standard local address
(`http://localhost:20128/v1`); still works with any other OpenAI-compatible
endpoint by just replacing that URL. Internal field/variable names were
left unchanged (`customApiUrl` etc.) so existing saved settings aren't
disrupted — only the labels people actually see changed.

## Word export rewritten from scratch: real .docx, real header

The previous Word export used the "HTML wrapped in Word namespaces, saved
as .doc" trick. That approach has no concept of a genuine repeating
header/footer region — Word just treats the whole thing as one flowing
body, which is exactly why the logos and header band rendered as ordinary
top-of-page-1 content with extra spacing instead of behaving like a real
Word header, and why fixing the spacing kept not sticking.

Replaced entirely with the [`docx`](https://github.com/dolanmiu/docx) npm
package (pure JS, generates genuine OOXML), loaded via its browser build
from a CDN the same way `pdfmake` already was — no server changes, no
Python, no new build step. `assets/docxExport.js` was rewritten top to
bottom: a real `Header`/`Footer` document part (so it repeats correctly on
every page, with a real incrementing page-number field, not a hardcoded
"Page 1"), and a DOM walker matching `pdfExport.js`'s content categories
(headings, paragraphs, meta-table, data table, the SOW's merged
group-header + items tables, callouts, bullet lists).

**This was verified for real, not just written and assumed to work:**
built the exact library end-to-end outside the app first (confirmed a
genuine `header1.xml` part with properly embedded/referenced logo images),
then ran the actual new `assets/docxExport.js` against a realistic
fixture matching the app's real template output via jsdom, then converted
the real output through LibreOffice (installed in this environment) and
rendered it to images to inspect directly — including a forced two-page
version specifically to confirm the header/footer genuinely repeat rather
than just looking right by coincidence on page 1. Client logo top-left,
company logo top-right, confirmed on both pages.

**On the module list you gave:** of everything listed, this ended up
closest in spirit to python-docx/docxtpl (a real native document-building
library rather than an HTML trick) but without needing to add Python to
what's otherwise a pure Node/browser app — `docx` is the direct JS
equivalent. The PDF side already went through the same kind of fix last
round using `pdfmake` (also verified with a real render, not just
reasoning about it) — LibreOffice Headless, WeasyPrint, Playwright, and
the rest weren't necessary for what was actually broken, though
LibreOffice is genuinely available in this environment if a doc↔pdf
conversion step is ever needed as a fallback path.

## OmniRoute "No content returned" — root cause found and fixed

**Diagnosis, confirmed against your test case:** Ask AI works because it
goes through the server (`/api/ask`), which sends a plain chat completion
with no `response_format` and no complexity beyond a normal message list —
exactly like your working Streamlit test. "Send to AI" (and every other
document-generation feature — Create DRD, Generate Proposal, Generate SOW,
Re-generate questions, AI-edit) runs entirely client-side and asks for
structured JSON output via `response_format: {type: "json_object"}` on a
much larger prompt.

The actual bug: OmniRoute apparently returns **HTTP 200 with empty
content** — not an error status — when the model it routes to can't
actually honor `response_format` on a prompt that large. The existing
retry-without-`response_format` logic only fired on HTTP 400/422, so it
never triggered for a "successful" 200 response that just happened to have
nothing in it — the app went straight to "No content returned."

**Fixed properly, not just for OmniRoute specifically:** `callOpenRouterRaw`
(the one shared function every client-side generation feature calls) now
retries whenever content comes back **empty, regardless of HTTP status** —
first without `response_format` if that was set, then non-streaming if
streaming was in use — before finally giving up. This is a general
reliability improvement for any OpenAI-compatible gateway with uneven
`response_format`/streaming support, not a narrow OmniRoute-only patch.

**Verified every OmniRoute call site in the app:**
- Client-side (Send to AI, Create DRD + Solutions, Generate Proposal,
  Generate SOW, Re-generate questions, AI-edit) — all six share the one
  function that was just fixed.
- Server-side Ask AI (`/api/ask`) — confirmed it never sends
  `response_format` at all, so it was never exposed to this bug (matches
  what you saw: it already worked).
- Server-side non-streaming chat completion (`callChatCompletion`) —
  confirmed it's defined but not actually called anywhere in the current
  code, so not a live path either way.
- Embeddings (Knowledge Base upload/search via OmniRoute) — not touched by
  this specific bug (embeddings don't use `response_format`), but worth
  knowing as a general caveat: OmniRoute is primarily a chat-completion
  gateway, so its `/v1/embeddings` support depends on what it routes to —
  if Knowledge Base uploads/search misbehave specifically, that would be a
  separate thing to check.

## Follow-up: "Unexpected token 'd', data:..." after the previous fix

The retry-ladder fix above introduced a new failure mode of its own, caught
from the actual error message: the final fallback step (retry
non-streaming) called `res.json()` assuming a `stream:false` request gets
a plain JSON body back — but OmniRoute appears to **always** respond in
SSE format regardless of what the `stream` parameter asks for, so
`res.json()` choked trying to parse raw `data: {...}` text as JSON.

Fixed by reading the response as text first, trying plain `JSON.parse`,
and falling back to extracting content from `data: {...}` lines (the same
logic the real streaming path already uses, added as a shared
`parseSseText` helper) if that fails — so it no longer matters whether a
given gateway honors `stream:false` or not. Verified directly with a
Node script simulating a realistic OmniRoute-style SSE body sent for a
"non-streaming" request: correctly reassembles the full JSON content
across chunks and confirms it parses as valid JSON afterward. Also
re-verified the plain-JSON path (OpenRouter/Ollama, which don't have this
quirk) still works unchanged.

## Send to AI still failing after the retry-ladder fix — added real diagnostics

Verified against the zip you sent back: the retry-ladder fix from last
round *is* present and running (all three attempts — with/without
`response_format`, streaming/non-streaming — genuinely fire), which means
this is a different, deeper issue than what was fixed before, since Ask AI
(small, simple prompt) keeps working while Send to AI (a much larger
prompt, requesting up to ~7800 tokens back) doesn't.

Since I can't reach your local OmniRoute instance to test directly, rather
than guess at a fourth theory I made two changes:

1. **Added one more fallback rung**: if all else fails, retry once more
   with `max_tokens` cut down to 1500. Some gateways/underlying models
   silently return nothing (rather than erroring) when the requested
   completion budget is large relative to a prompt that's already using
   a lot of context — this checks for that specific case.
2. **The error message itself now carries real diagnostic detail** instead
   of a generic line — a snippet of whatever the provider actually sent
   back on the last attempt. If it still fails, that message (or the
   browser console, which logs the same detail) should point at the actual
   cause directly rather than needing another round of back-and-forth
   guessing.

If it's still empty after this, the pattern (works for Ask AI's small
requests, fails for the large structured-generation ones) increasingly
points at something in OmniRoute's own request handling or whatever model
it's routing "auto/smart" to for larger prompts — worth checking on
OmniRoute's own side (its dashboard/logs) for what's happening to those
specific requests, since the app is now correctly avoiding every
request-shape issue it can control for.

## Found the real cause: OmniRoute's own automatic compression pipeline

Confirmed against OmniRoute's public documentation and issue tracker
(diegosouzapw/OmniRoute on GitHub), not more guessing. OmniRoute runs a
prompt-compression pipeline (Caveman, RTK, LLMLingua-2, and others)
**automatically before requests reach the upstream provider**, with an
auto-trigger threshold based on size/content — a tiny "hi" request never
crosses it, which is exactly why Ask AI kept working throughout all of
this. That pipeline is explicitly tuned for coding-agent content: git
diffs, terminal/test output, build logs, and JSON tool output — it
includes heuristic "output class" detection and things like "code-block
thinning." Our Document-analysis prompt is large *and* deliberately
contains a literal JSON schema template with exact key names the model
needs to reproduce precisely — exactly the shape of content that pipeline
could misdetect and mangle, silently, with no error, which lines up with
OmniRoute's own known "Upstream returned an empty response" issues
(#3388, #3430 on their tracker — still open as of their latest release at
the time of writing).

**Fixed by sending `x-omniroute-compression: off`** on every request this
app makes when the provider is OmniRoute — both client-side
(`assets/openrouter.js`, covering Send to AI, Create DRD, Generate
Proposal/SOW, and everything else) and server-side
(`server/server.js`, covering Ask AI once a Knowledge-Base-grounded query
grows large enough to matter). This is a real, documented OmniRoute
request header, not a guess — confirmed from their own API reference. It's
a harmless no-op for OpenRouter and Ollama, which simply ignore a header
they don't recognize.

**One separate, unrelated thing worth knowing**: the OmniRoute dashboard
you shared shows "Embeddings: 0 models" — meaning OmniRoute currently has
no embedding-capable provider connected on your setup. That's not
something this fix (or any header) can address; if Knowledge Base
uploads/search are ever pointed at OmniRoute for embeddings specifically,
that would need an embedding model actually configured on OmniRoute's own
side first.

## NVIDIA NIM added as a full 4th provider — client and server both

Finished the NVIDIA NIM integration you asked for as an independent
fallback path (its own fixed endpoint at build.nvidia.com, no shared
routing/infrastructure with OmniRoute, so a problem on one doesn't take
down the other):

- **Client-side** (`assets/openrouter.js`, `assets/state.js`): full
  provider parity with OpenRouter/Ollama/OmniRoute — `isNvidiaChat()`/
  `isNvidiaEmbed()` helpers, `chatReady()`/`embedReady()`/`activeModel()`
  branches, request URL/headers/error messages.
- **Server-side** (`server/server.js`) — this was the piece left over
  from last round: `resolveChatProvider` (used by `/api/ask`) and
  `embedTexts` (used by Knowledge Base upload/search and Ask AI's
  document-grounding) both got the same NVIDIA branch OmniRoute already
  had, threaded through every one of their call sites (4 for `embedTexts`
  alone) and the `req.body` destructuring at each endpoint that calls them.
- **Client request bodies** (`assets/knowledgeBase.js`, `assets/askAi.js`)
  now actually send `nvidiaApiKey` alongside the existing settings — found
  and fixed all three places that build these request bodies by hand.
- **Setup UI**: a 4th toggle button next to OpenRouter/Ollama/OmniRoute
  for both Chat model and Embedding model, a shared "NVIDIA NIM" server
  card (API key only — its base URL is fixed, nothing to configure there
  unlike OmniRoute's variable one), and status pill / readiness-check
  labels updated to match.

Verified: no duplicate element IDs anywhere in `index.html`, every new
NVIDIA-related ID referenced in JS confirmed to actually exist in the
markup, all files pass `node --check`.

Also: glad the `big-pickle` diagnosis actually explained something real —
disabling it on OmniRoute's side should stop `auto/smart` from landing on
it again for large requests.

## Two real bugs found and fixed — both confirmed against evidence, not guessed

**1. Word export: wrong CDN path, not a network problem.** The `docx`
library script tag pointed at `unpkg.com/docx@9.7.1/build/index.umd.cjs`
— copied from `pdfmake`'s URL pattern without checking whether `docx`
actually publishes to the same folder. It doesn't: confirmed directly
against the real published npm package contents (downloaded and
inspected the tarball) that `docx` ships its browser bundle under
`dist/`, not `build/`. The old URL was a 404, which is exactly why the
library "didn't load" regardless of your internet connection. Fixed to
`dist/index.umd.cjs`.

While fixing this, caught a gap in my own earlier verification: last
round I tested the `docx` library via Node's `require()`, which resolves
a *different* entry point (`dist/index.cjs`, the CommonJS build) than
what a `<script>` tag actually loads in a browser (`dist/index.umd.cjs`,
the UMD build) — so that test never actually exercised the real path this
bug was in. Re-verified properly this time using Node's `vm` module to
build a genuinely isolated context with no `module`/`exports`/`define`
globals (a real stand-in for what a browser `<script>` tag sees, since a
plain Node `eval()` still has those in scope and silently takes a
different branch of the UMD wrapper) — confirmed the actual browser bundle
correctly sets `window.docx` with the full `Document`/`Packer.toBlob`/
`Header`/`ImageRun` API intact.

**2. NVIDIA NIM "No answer returned by the model" — a real API behavior
difference, revealed directly by your sample code.** `nemotron-3-ultra`
with `enable_thinking: true` is a reasoning model: its streaming response
splits output across two separate fields per chunk — `delta.reasoning_content`
(the thinking trace) and `delta.content` (the final answer, which stays
empty for as long as the model is still "thinking", sometimes for the
entire response if reasoning consumes the whole token budget). This
app's SSE parser (both server-side, used by Ask AI, and client-side, used
by every document-generation feature) only ever read `delta.content` —
it had no idea `reasoning_content` existed, so a reasoning-only response
looked completely empty.

Fixed in both places: `reasoning_content` is now tracked separately.
For Ask AI (free-form text), if `content` never arrives but reasoning
did, the reasoning trace is used as the answer instead of failing
outright, with a note explaining what happened. For the document
generation features (which expect structured JSON back, so substituting
a raw reasoning trace would just produce invalid JSON instead of a
document), the reasoning content is surfaced in the error diagnostics
instead, so it's obvious what actually happened rather than a bare "no
content" message. Verified directly with simulated streams covering
reasoning-only, normal content, and reasoning-then-content — confirmed
each behaves correctly, including that ordinary (non-reasoning) responses
are completely unaffected.
