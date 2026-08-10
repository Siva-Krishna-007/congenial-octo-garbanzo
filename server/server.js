/* Knowledge Base API for Proposal Studio.
   - Accepts .md / .txt / .json uploads, chunks them, and embeds them via
     whichever provider is set in Setup (OpenRouter or a local Ollama
     model), storing the vectors in Qdrant -- a separately-run vector
     database this app connects to but does NOT manage as a child process.
     You're expected to already have Qdrant running yourself (e.g.
     `qdrant.exe`, or Docker) at QDRANT_URL (default http://localhost:6333,
     see server/.env). Default collection: "zoho_data" (also set via
     server/.env, or switch collections at runtime in the Knowledge Base
     card's "Qdrant collection being searched").
   - Qdrant schema matches a companion Streamlit RAG tool (app.py) exactly,
     so both can read/write the same collections interchangeably: points
     use a *named* dense vector called "pro1" (VECTOR_NAME in that script),
     and payload keys "file_name" / "chunk_index" (not "source"/
     "chunkIndex") for identifying which document a chunk came from. This
     app's own HTTP API still speaks "source"/"chunks"/"uploadedAt" to the
     browser as before -- the translation happens only here, at the Qdrant
     boundary, so the frontend needed zero changes for this.
   - Exposes /api/ask, used by the floating "Ask AI" bubble in the app: it
     embeds the question, retrieves the most relevant chunks from the
     Knowledge Base, and answers via the configured chat provider (using
     the key/model the browser already has from Setup) -- grounded in the
     KB when relevant, falling back to general knowledge otherwise. Every
     Q&A pair is then written back into Qdrant (a separate "chat_history"
     collection) so the conversation itself becomes part of the searchable
     knowledge base. */

const path = require('path');
require('dotenv').config(); // loads server/.env if present (e.g. QDRANT_URL, QDRANT_COLLECTION)
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { QdrantClient } = require('@qdrant/js-client-rest');

const PORT = process.env.PORT || 5001;
const CHAT_HISTORY_COLLECTION = 'chat_history';
let chatHistoryDimensionWarned = false;

// Matches VECTOR_NAME in the companion Streamlit app.py, so any collection
// this app creates fresh uses the same named-vector convention. Existing
// collections (e.g. one app.py already populated) are still auto-detected
// via getVectorConfig below regardless of what they actually use.
const DEFAULT_VECTOR_NAME = 'pro1';
// Matches app.py's payload field names, so chunks from either tool are
// identical in shape and mutually readable/filterable.
const PAYLOAD_FILE_KEY = 'file_name';
const PAYLOAD_CHUNK_KEY = 'chunk_index';
// Not part of the app.py interop schema (that companion tool doesn't know
// about this field, and doesn't need to -- it's purely an organizational
// label this app adds on top, ignored harmlessly by anything else reading
// the same collection).
const PAYLOAD_SECTION_KEY = 'doc_section';

// Persisted across restarts, so re-launching the server (or the whole
// machine) doesn't lose which collection was active and force you to
// re-pick it. Only changes when you explicitly select a different
// collection in the UI -- never reset automatically on startup.
const KB_CONFIG_PATH = path.join(__dirname, 'kb-config.json');
function loadKbConfig() {
  try { return JSON.parse(fs.readFileSync(KB_CONFIG_PATH, 'utf-8')); } catch (e) { return {}; }
}
function saveKbConfig(patch) {
  Object.assign(kbConfig, patch);
  try { fs.writeFileSync(KB_CONFIG_PATH, JSON.stringify(kbConfig, null, 2)); } catch (e) { console.warn('Could not save kb-config.json:', e.message); }
  return kbConfig;
}
const kbConfig = loadKbConfig();

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

// activeCollectionNames: which collection(s) Ask AI searches across (checked
// in the "Qdrant collection being searched" list -- multi-select). The
// FIRST entry is also the "primary" collection: where new uploads land, and
// what the Reference documents table / tools.json lookup operate on. It's
// always the most recently activated one, so single-collection workflows
// behave exactly as before -- multi-select is additive on top of that.
let activeCollectionNames = (Array.isArray(kbConfig.searchCollectionNames) && kbConfig.searchCollectionNames.length)
  ? kbConfig.searchCollectionNames.slice()
  : [kbConfig.collectionName || process.env.QDRANT_COLLECTION || 'zoho_data'];
let activeCollectionName = activeCollectionNames[0];

function setActiveCollections(names) {
  activeCollectionNames = names && names.length ? names.slice() : [activeCollectionName];
  activeCollectionName = activeCollectionNames[0];
  saveKbConfig({ collectionName: activeCollectionName, searchCollectionNames: activeCollectionNames });
}

const qdrant = new QdrantClient({ url: QDRANT_URL });

const ALLOWED_EXT = ['.md', '.txt', '.json'];
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
const EMBED_BATCH_SIZE = 32;

// Matches the Ollama backend actually crashing (llama-server process dying,
// usually a GPU/CUDA driver issue on the machine) -- distinct from a normal
// HTTP error, and worth retrying since Ollama typically respawns the
// subprocess on the next request.
function looksLikeOllamaCrash(text) {
  return /process has terminated|CUDA error|overrun|access violation/i.test(text || '');
}

// Retries both network-level failures (ECONNRESET, "fetch failed", etc --
// common when embedding a large file means hundreds of sequential requests
// in a row; any single one can hit a transient blip) and Ollama backend
// crashes, with a short backoff between attempts. Used for every outbound
// call to OpenRouter/Ollama in this file.
async function fetchResilient(url, options, providerLabel, usingOllama, maxAttempts) {
  maxAttempts = maxAttempts || 3;
  let lastNetworkErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (networkErr) {
      lastNetworkErr = networkErr;
      if (attempt < maxAttempts) {
        const waitMs = 800 * attempt;
        console.warn(`${providerLabel} network error (${networkErr.message}) -- retrying (attempt ${attempt + 1}/${maxAttempts}) in ${waitMs}ms...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw new Error(
        `Could not reach ${providerLabel} after ${maxAttempts} attempts` +
        (usingOllama ? ` at ${url} -- make sure "ollama serve" is running.` : '.') +
        ` Details: ${networkErr.message}`
      );
    }

    if (!res.ok) {
      const t = await res.text();
      const isCrash = usingOllama && looksLikeOllamaCrash(t);
      if (isCrash && attempt < maxAttempts) {
        const waitMs = 1500 * attempt;
        console.warn(`${providerLabel} backend crashed -- retrying (attempt ${attempt + 1}/${maxAttempts}) in ${waitMs}ms...`, t.slice(0, 200));
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      if (isCrash) {
        throw new Error(
          `Ollama's local model backend keeps crashing (likely a GPU/CUDA driver issue on this machine). ` +
          `Try: updating your NVIDIA drivers, restarting Ollama, forcing CPU mode (OLLAMA_NO_CUDA=1), or a different model. Raw error: ${t.slice(0, 200)}`
        );
      }
      throw new Error(`${providerLabel} error ${res.status}: ${t.slice(0, 300)}`);
    }
    return res;
  }
  throw lastNetworkErr; // unreachable in practice, satisfies control flow
}

/* ---------- chat completion: OpenRouter, Ollama, or a Custom OpenAI-compatible API ---------- */

// Resolves which URL/headers/label to use for a chat call, given the
// provider selected in Setup. "custom" is any OpenAI-compatible endpoint
// (Groq, Together.ai, a self-hosted vLLM/LM Studio server, etc.) -- same
// request shape as OpenRouter, just a different base URL + key. "nvidia"
// is NVIDIA NIM (build.nvidia.com) -- a fixed single endpoint, unlike
// "custom"'s variable base URL.
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
function resolveChatProvider({ apiKey, provider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey }) {
  const usingOllama = provider === 'ollama';
  const usingCustom = provider === 'custom';
  const usingNvidia = provider === 'nvidia';
  const effectiveKey = usingCustom ? customApiKey : usingNvidia ? nvidiaApiKey : apiKey;
  if (!usingOllama && !effectiveKey) throw new Error(usingCustom ? 'Add your Custom API key in Setup first.' : usingNvidia ? 'Add your NVIDIA NIM API key in Setup first.' : 'Add your OpenRouter API key in Setup first.');
  if (usingCustom && !(customApiUrl || '').trim()) throw new Error('Add your Custom API base URL in Setup first.');

  const url = usingOllama ? `${(ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '')}/v1/chat/completions`
    : usingCustom ? `${customApiUrl.replace(/\/+$/, '')}/chat/completions`
    : usingNvidia ? `${NVIDIA_BASE_URL}/chat/completions`
    : OPENROUTER_URL;
  const providerLabel = usingOllama ? 'Ollama' : usingCustom ? 'Custom API' : usingNvidia ? 'NVIDIA NIM' : 'OpenRouter';
  const headers = { 'Content-Type': 'application/json' };
  if (!usingOllama) headers['Authorization'] = 'Bearer ' + effectiveKey;
  if (usingCustom) headers['x-omniroute-compression'] = 'off'; // see assets/openrouter.js for why -- same reasoning applies here once a KB-grounded query grows large enough to cross OmniRoute's auto-compression threshold
  return { url, providerLabel, headers, usingOllama };
}

async function callChatCompletion(messages, { apiKey, model, provider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey, temperature = 0.4, maxTokens = 900, ollamaContextLength }) {
  if (!model) throw new Error(provider === 'ollama' ? 'Enter an Ollama chat model in Setup first.' : provider === 'custom' ? 'Enter a model id for your Custom API in Setup first.' : 'Choose a model in Setup first.');
  const { url, providerLabel, headers, usingOllama } = resolveChatProvider({ apiKey, provider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey });

  const reqBody = { model, messages, temperature, max_tokens: maxTokens };
  if (usingOllama && ollamaContextLength) {
    const ctx = parseInt(ollamaContextLength, 10);
    if (ctx > 0) reqBody.num_ctx = ctx;
  }
  const res = await fetchResilient(url,
    { method: 'POST', headers, body: JSON.stringify(reqBody) },
    providerLabel, usingOllama);
  const data = await res.json();
  const message = data.choices && data.choices[0] && data.choices[0].message;
  const answer = message && message.content;
  if (!answer && message && message.reasoning_content) {
    console.warn(providerLabel + ' only returned reasoning_content, no final content -- using the reasoning trace as the answer');
    return message.reasoning_content.trim() + '\n\n(Note: this model returned its reasoning/thinking trace but did not reach a final answer, likely because reasoning used the full token budget. Try again, or increase the completion length if this keeps happening.)';
  }
  if (!answer) throw new Error('No answer returned by the model.');
  return answer;
}

// Streaming variant used by /api/ask -- calls onDelta(text) as each chunk of
// the answer arrives, so the browser can render it token-by-token instead
// of waiting for the whole thing. Same crash-retry behavior as the
// non-streaming version, applied before any bytes have been forwarded to
// the client (so a crash-and-retry here is invisible to them).
async function callChatCompletionStreaming(messages, { apiKey, model, provider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey, temperature = 0.4, maxTokens = 900, ollamaContextLength }, onDelta) {
  if (!model) throw new Error(provider === 'ollama' ? 'Enter an Ollama chat model in Setup first.' : provider === 'custom' ? 'Enter a model id for your Custom API in Setup first.' : 'Choose a model in Setup first.');
  const { url, providerLabel, headers, usingOllama } = resolveChatProvider({ apiKey, provider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey });

  const reqBody = { model, messages, temperature, max_tokens: maxTokens, stream: true };
  // Ollama-only (see Admin > LLM Context) -- a top-level extension field,
  // never sent to OpenRouter/Custom API, which manage their own context server-side.
  if (usingOllama && ollamaContextLength) {
    const ctx = parseInt(ollamaContextLength, 10);
    if (ctx > 0) reqBody.num_ctx = ctx;
  }
  const body = JSON.stringify(reqBody);

  const res = await fetchResilient(url, { method: 'POST', headers, body }, providerLabel, usingOllama);

  const decoder = new TextDecoder();
  let full = '';
  let reasoning = '';
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const d = json.choices && json.choices[0] && json.choices[0].delta;
        if (d && d.content) { full += d.content; onDelta(d.content); }
        else if (d && d.reasoning_content) { reasoning += d.reasoning_content; } // reasoning models (NVIDIA nemotron w/ enable_thinking, DeepSeek-R1-style) put thinking here, separate from the final answer
      } catch (e) { /* partial/non-JSON chunk boundary -- ignore and keep reading */ }
    }
  }
  if (!full && reasoning) {
    // The model was genuinely producing output the whole time -- it just
    // never got past its reasoning/thinking phase to a final answer
    // (often because that took the whole token budget). Surfacing the
    // reasoning trace is more honest and useful than a bare "no answer".
    console.warn(providerLabel + ' only returned reasoning_content, no final content -- using the reasoning trace as the answer');
    return reasoning.trim() + '\n\n(Note: this model returned its reasoning/thinking trace but did not reach a final answer, likely because reasoning used the full token budget. Try again, or increase the completion length if this keeps happening.)';
  }
  if (!full) throw new Error('No answer returned by the model.');
  return full;
}

/* ---------- embeddings: OpenRouter, Ollama, or a Custom OpenAI-compatible API ---------- */
async function embedTexts(texts, apiKey, embedModel, provider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey, opts) {
  opts = opts || {};
  const batchSize = opts.batchSize || EMBED_BATCH_SIZE;
  const usingOllama = provider === 'ollama';
  const usingCustom = provider === 'custom';
  const usingNvidia = provider === 'nvidia';
  const effectiveKey = usingCustom ? customApiKey : usingNvidia ? nvidiaApiKey : apiKey;
  if (!usingOllama && !effectiveKey) throw new Error(usingCustom ? 'Add your Custom API key in Setup first.' : usingNvidia ? 'Add your NVIDIA NIM API key in Setup first.' : 'Add your OpenRouter API key in Setup first.');
  if (usingCustom && !(customApiUrl || '').trim()) throw new Error('Add your Custom API base URL in Setup first.');
  if (!embedModel) throw new Error(
    usingOllama ? 'Enter an Ollama embedding model in Setup first.' :
    usingCustom ? 'Enter an embedding model id for your Custom API in Setup first.' :
    usingNvidia ? 'Enter an embedding model id for your NVIDIA NIM setup in Setup first.' :
    'Choose an embedding model in Setup first.'
  );

  const url = usingOllama ? `${(ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '')}/v1/embeddings`
    : usingCustom ? `${customApiUrl.replace(/\/+$/, '')}/embeddings`
    : usingNvidia ? `${NVIDIA_BASE_URL}/embeddings`
    : OPENROUTER_EMBEDDINGS_URL;
  const providerLabel = usingOllama ? 'Ollama' : usingCustom ? 'Custom API' : usingNvidia ? 'NVIDIA NIM' : 'OpenRouter';
  const headers = { 'Content-Type': 'application/json' };
  if (!usingOllama) headers['Authorization'] = 'Bearer ' + effectiveKey;
  if (usingCustom) headers['x-omniroute-compression'] = 'off';

  const vectors = [];
  const totalBatches = Math.ceil(texts.length / batchSize);
  for (let i = 0, batchNum = 1; i < texts.length; i += batchSize, batchNum++) {
    if (opts.isAborted && opts.isAborted()) { const e = new Error('Cancelled.'); e.cancelled = true; throw e; }
    const batch = texts.slice(i, i + batchSize);
    // Large files mean many sequential requests here (hundreds, for a very
    // long document) -- any single one can hit a transient network blip
    // (ECONNRESET, etc), so each batch gets several retry attempts rather
    // than failing the whole upload over one bad connection.
    const res = await fetchResilient(url,
      { method: 'POST', headers, body: JSON.stringify({ model: embedModel, input: batch }) },
      providerLabel + ' embeddings', usingOllama, 5);
    const data = await res.json();
    const items = (data.data || []).slice().sort((a, b) => (a.index || 0) - (b.index || 0));
    items.forEach(item => vectors.push(item.embedding));
    if (items.length !== batch.length) {
      throw new Error(`${providerLabel} returned ${items.length} embeddings for a batch of ${batch.length} inputs.`);
    }
    if (opts.onProgress) opts.onProgress(batchNum, totalBatches, vectors.length, texts.length);
    if (totalBatches > 5 && batchNum % 10 === 0) {
      console.log(`Embedding progress: batch ${batchNum}/${totalBatches} (${vectors.length}/${texts.length} chunks)...`);
    }
  }
  return vectors;
}

/* ---------- Qdrant helpers ---------- */

// Qdrant needs a collection to exist, with a fixed vector size + distance
// metric, before you can upsert into it -- unlike Chroma's
// getOrCreateCollection, there's no "just figure it out" mode. We only find
// out the vector size once we've actually computed an embedding, so this is
// called right before every upsert with that size; a no-op (beyond
// detecting its schema) if the collection already exists.
//
// Collections aren't always created with the default *unnamed* vector --
// e.g. a pre-existing "proj1" collection built by another tool may use a
// *named* dense vector (plus an unrelated sparse vector for hybrid search).
// Sending a bare vector array to a collection expecting a named one is
// exactly what a "Bad Request" on upload usually means. This detects and
// caches whichever shape each collection actually uses, once, so every
// upsert/search after that matches it automatically.
const collectionVectorConfig = {}; // name -> { vectorName: string|null, size: number|null }

async function getVectorConfig(name) {
  if (collectionVectorConfig[name]) return collectionVectorConfig[name];
  const info = await qdrant.getCollection(name);
  const vectors = info && info.config && info.config.params && info.config.params.vectors;
  let config;
  if (vectors && typeof vectors.size === 'number') {
    // The default, unnamed vector -- { size, distance }.
    config = { vectorName: null, size: vectors.size };
  } else if (vectors && typeof vectors === 'object') {
    // One or more *named* dense vectors -- { name: { size, distance }, ... }.
    // Sparse vectors live in a separate config.params.sparse_vectors field,
    // so this map only ever contains dense ones. Prefer a name matching the
    // collection itself (some tools name it that way), else just take the first.
    const names = Object.keys(vectors);
    const preferred = names.find(n => n === name) || names[0];
    config = { vectorName: preferred, size: vectors[preferred] && vectors[preferred].size };
  } else {
    config = { vectorName: null, size: null };
  }
  collectionVectorConfig[name] = config;
  return config;
}

async function ensureCollection(name, vectorSize) {
  try {
    await getVectorConfig(name); // exists -- cache its real schema, whatever it is
  } catch (e) {
    await qdrant.createCollection(name, { vectors: { [DEFAULT_VECTOR_NAME]: { size: vectorSize, distance: 'Cosine' } } });
    try {
      await qdrant.createPayloadIndex(name, { field_name: PAYLOAD_FILE_KEY, field_schema: 'keyword' });
    } catch (idxErr) {
      console.warn(`Could not create payload index on "${PAYLOAD_FILE_KEY}" for "${name}":`, idxErr.message);
    }
    collectionVectorConfig[name] = { vectorName: DEFAULT_VECTOR_NAME, size: vectorSize };
  }
}

// Builds the correct `vector` field for an upsert point, matching whatever
// shape this collection actually expects (bare array, or { name: array }
// for a named-vector collection like "proj1"/"pro1").
function toPointVector(vectorConfig, embedding) {
  if (vectorConfig && vectorConfig.vectorName) return { [vectorConfig.vectorName]: embedding };
  return embedding;
}

// Same idea for search: a named-vector collection needs a separate `using`
// field naming which vector to search, alongside the raw query vector.
function searchUsing(vectorConfig) {
  return (vectorConfig && vectorConfig.vectorName) || undefined;
}

// The installed @qdrant/js-client-rest (1.19.x) has no `search()` method --
// newer client versions replaced it with `query()`, which takes the vector
// under `query` (not `vector`) alongside a separate `using` field for named
// vectors (not the old `{name, vector}` nesting), and returns
// `{points: [...]}` rather than a bare array. This wraps that so call sites
// don't need to know the difference.
async function queryPoints(collectionName, { vector, vectorConfig, limit, filter }) {
  const response = await qdrant.query(collectionName, {
    query: vector,
    using: searchUsing(vectorConfig),
    limit,
    filter,
    with_payload: true
  });
  return response.points || [];
}

function checkVectorSize(vectorConfig, embedding, collectionName) {
  if (vectorConfig && vectorConfig.size && embedding.length !== vectorConfig.size) {
    throw new Error(
      `Your embedding model produces ${embedding.length}-dimension vectors, but collection "${collectionName}"` +
      (vectorConfig.vectorName ? ` (vector "${vectorConfig.vectorName}")` : '') +
      ` expects ${vectorConfig.size}. Switch to an embedding model/provider that matches whatever originally populated this collection, or use a different collection.`
    );
  }
}

// Qdrant's scroll API is paginated -- this loops until there's no more
// next_page_offset. Capped to avoid a runaway loop against a huge
// collection; large enough for any realistic document set here.
async function scrollAll(collectionName, filter, maxPoints) {
  maxPoints = maxPoints || 100000;
  let all = [];
  let offset;
  do {
    const res = await qdrant.scroll(collectionName, {
      filter, with_payload: true, with_vector: false, limit: 1000, offset
    });
    all = all.concat(res.points || []);
    offset = res.next_page_offset;
  } while (offset && all.length < maxPoints);
  return all;
}

function sourceFilterFor(source) {
  return { must: [{ key: PAYLOAD_FILE_KEY, match: { value: source } }] };
}

// Qdrant rejects a single request once its JSON payload exceeds its default
// limit (32MB) -- a document with thousands of chunks, each carrying a
// 1024-dim (or larger) vector plus its own text, adds up fast in one shot.
// Splits into batches well under that ceiling, upserting sequentially, with
// a short retry on transient failures and an adaptive fallback (halve and
// retry) if a batch somehow still comes back "too large" (e.g. unusually
// long individual chunks).
const UPSERT_BATCH_SIZE = 300;
async function upsertPointsInBatches(collectionName, points, batchSize, opts) {
  opts = opts || {};
  batchSize = batchSize || UPSERT_BATCH_SIZE;
  const totalBatches = Math.ceil(points.length / batchSize);
  for (let i = 0, batchNum = 1; i < points.length; i += batchSize, batchNum++) {
    if (opts.isAborted && opts.isAborted()) { const e = new Error('Cancelled.'); e.cancelled = true; throw e; }
    const batch = points.slice(i, i + batchSize);
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        await qdrant.upsert(collectionName, { points: batch });
        break;
      } catch (e) {
        const msg = (e && e.message) || String(e);
        const tooLarge = /larger than allowed|payload/i.test(msg);
        if (tooLarge && batch.length > 1) {
          console.warn(`Upsert batch of ${batch.length} points was still too large -- splitting it in half and retrying...`);
          const mid = Math.ceil(batch.length / 2);
          await upsertPointsInBatches(collectionName, batch.slice(0, mid), Math.ceil(batchSize / 2), opts);
          await upsertPointsInBatches(collectionName, batch.slice(mid), Math.ceil(batchSize / 2), opts);
          break;
        }
        if (tooLarge || attempt >= 3) throw e;
        const waitMs = 800 * attempt;
        console.warn(`Qdrant upsert failed (${msg}) -- retrying (attempt ${attempt + 1}/3) in ${waitMs}ms...`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
    if (opts.onProgress) opts.onProgress(batchNum, totalBatches, Math.min(i + batchSize, points.length), points.length);
    if (totalBatches > 5 && batchNum % 10 === 0) {
      console.log(`Storing progress: batch ${batchNum}/${totalBatches} (${Math.min(i + batchSize, points.length)}/${points.length} points)...`);
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB -- large .md files (thousands of chunks) take a while to embed but shouldn't be rejected outright

function isLowSurrogate(ch) { return ch >= '\uDC00' && ch <= '\uDFFF'; }

// Nudges a slice boundary forward by one character if it would otherwise
// land between the two UTF-16 halves of an astral character (emoji, etc --
// anything outside the Basic Multilingual Plane). Splitting one there
// leaves a lone surrogate at the edge of a chunk, which JSON.stringify
// escapes in a way that can't be validly re-encoded to UTF-8 bytes --
// exactly what produces a "Format error in JSON body: unexpected end of
// hex escape" from Qdrant. A single document with a few hundred emoji
// scattered through it (common in FAQ-style docs using them as bullets)
// makes hitting this boundary a near-certainty at a fixed chunk size.
function safeSliceEnd(text, end) {
  if (end > 0 && end < text.length && isLowSurrogate(text[end])) return end + 1;
  return end;
}

// Defense in depth: strips any lone surrogate that still makes it through
// for some other reason (e.g. the source file itself had malformed
// encoding), so a bad character can never silently corrupt an entire
// upload's JSON body again.
function stripLoneSurrogates(text) {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

function chunkText(text, chunkSize, overlap) {
  chunkSize = chunkSize || 1500; // was 900 -- too easily split a single procedure/section (header + steps + notes) across two chunks, so only half of it could ever be retrieved together
  overlap = overlap || 250;
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = safeSliceEnd(text, Math.min(start + chunkSize, text.length));
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks.map(c => stripLoneSurrogates(c).trim()).filter(Boolean);
}

function extractText(filename, buffer) {
  const ext = path.extname(filename).toLowerCase();
  const raw = buffer.toString('utf-8');
  if (ext === '.json') {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch (e) { return raw; }
  }
  return raw;
}

/* ---------- routes ---------- */

app.get('/api/health', async (req, res) => {
  try {
    await qdrant.getCollections();
    res.json({ ok: true, qdrantUrl: QDRANT_URL, activeCollection: activeCollectionName });
  } catch (e) {
    res.status(503).json({
      ok: false,
      error: `Could not reach Qdrant at ${QDRANT_URL}. Make sure it's running (e.g. qdrant.exe, or Docker) and QDRANT_URL in server/.env points at it. Details: ${e.message}`
    });
  }
});

app.post('/api/kb/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    return res.status(400).json({ error: 'Unsupported file type. Only .md, .txt, .json are allowed.' });
  }
  const { apiKey, embedModel, sourceOverride, embedProvider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey, docSection } = req.body || {};
  // Optional overrides (Knowledge Base card's "Advanced" section) -- sane
  // defaults are used for anything not provided.
  const chunkSize = parseInt(req.body.chunkSize, 10) || 900;
  const chunkOverlap = parseInt(req.body.chunkOverlap, 10) || 150;
  const embedBatchSize = parseInt(req.body.embedBatchSize, 10) || EMBED_BATCH_SIZE;
  const upsertBatchSize = parseInt(req.body.upsertBatchSize, 10) || UPSERT_BATCH_SIZE;

  const sourceName = (sourceOverride && sourceOverride.trim()) || req.file.originalname;
  const text = extractText(sourceName, req.file.buffer);
  if (!text.trim()) return res.status(400).json({ error: 'File is empty.' });

  const chunks = chunkText(text, chunkSize, chunkOverlap);
  if (!chunks.length) return res.status(400).json({ error: 'No content to embed after chunking.' });

  // From here on, progress streams back as Server-Sent Events instead of
  // one JSON blob at the end -- the browser renders a real progress bar
  // driven by actual batch counts, for both the embedding and storing
  // phases, instead of a static "Uploading..." spinner. Also lets the
  // browser cancel mid-upload: closing the connection (Cancel button) is
  // detected here and checked between batches to stop promptly rather than
  // continuing to burn embedding calls for a result nobody wants anymore.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const send = obj => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (e) { /* client already gone */ } };

  let aborted = false;
  // Watching the RESPONSE stream, not the request: by this point multer has
  // already fully consumed the incoming upload body, so req's read side is
  // done regardless of anything the client does -- req.on('close') fired
  // here almost immediately on every upload, mistaking "the request body
  // finished" for "the user cancelled." res.on('close') instead reflects
  // whether the client is still there to receive the SSE stream we're
  // actively writing, which is what a genuine Cancel-button abort affects.
  res.on('close', () => { aborted = true; });
  const isAborted = () => aborted;

  send({ type: 'start', totalChunks: chunks.length });

  try {
    const embeddings = await embedTexts(chunks, apiKey, embedModel, embedProvider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey, {
      batchSize: embedBatchSize,
      isAborted,
      onProgress: (batchNum, totalBatches, done, total) => send({ type: 'progress', phase: 'embedding', batchNum, totalBatches, done, total })
    });
    await ensureCollection(activeCollectionName, embeddings[0].length);
    const vectorConfig = await getVectorConfig(activeCollectionName);
    checkVectorSize(vectorConfig, embeddings[0], activeCollectionName);

    // Re-uploading a file with the same name replaces its old chunks.
    try { await qdrant.delete(activeCollectionName, { filter: sourceFilterFor(sourceName) }); } catch (e) { /* nothing to remove */ }

    const uploadedAt = new Date().toISOString();
    const points = chunks.map((text, i) => ({
      id: uuidv4(),
      vector: toPointVector(vectorConfig, embeddings[i]),
      payload: { [PAYLOAD_FILE_KEY]: sourceName, [PAYLOAD_CHUNK_KEY]: i, [PAYLOAD_SECTION_KEY]: docSection || '', uploadedAt, text }
    }));
    await upsertPointsInBatches(activeCollectionName, points, upsertBatchSize, {
      isAborted,
      onProgress: (batchNum, totalBatches, done, total) => send({ type: 'progress', phase: 'storing', batchNum, totalBatches, done, total })
    });

    send({ type: 'done', file: sourceName, chunks: chunks.length });
    res.end();
  } catch (e) {
    if (e.cancelled) {
      console.log(`Upload of "${sourceName}" cancelled by the user.`);
      // The connection is already closed if the browser triggered this; a
      // write here is a harmless no-op via the try/catch inside send().
      return res.end();
    }
    console.error('Upload error', e);
    send({ type: 'error', error: e.message });
    res.end();
  }
});

app.get('/api/kb/documents', async (req, res) => {
  try {
    const points = await scrollAll(activeCollectionName);
    const bySource = {};
    points.forEach(p => {
      const m = p.payload;
      const fileName = m && m[PAYLOAD_FILE_KEY];
      if (!fileName) return;
      if (!bySource[fileName]) bySource[fileName] = { source: fileName, chunks: 0, uploadedAt: m.uploadedAt, section: m[PAYLOAD_SECTION_KEY] || '' };
      bySource[fileName].chunks += 1;
      if (!bySource[fileName].section && m[PAYLOAD_SECTION_KEY]) bySource[fileName].section = m[PAYLOAD_SECTION_KEY];
    });
    res.json({ documents: Object.values(bySource).sort((a, b) => a.source.localeCompare(b.source)) });
  } catch (e) {
    console.error('List error', e);
    // A collection that doesn't exist yet just means "no documents" -- not an error.
    if (String(e.message).includes('404') || String(e.message).toLowerCase().includes('not found')) {
      return res.json({ documents: [] });
    }
    res.status(500).json({ error: e.message });
  }
});

// Reconstructs one document's full text from its stored chunks (sorted by
// chunkIndex) -- used by the Domain/Tools "Send to AI" check (grounding
// tool-fit against a specific reference document, e.g. tools.json).
app.get('/api/kb/documents/:source/content', async (req, res) => {
  try {
    const points = await scrollAll(activeCollectionName, sourceFilterFor(req.params.source));
    if (!points.length) return res.status(404).json({ error: `No document named "${req.params.source}" was found.` });
    const ordered = points.map(p => ({ text: p.payload.text, chunkIndex: p.payload[PAYLOAD_CHUNK_KEY] || 0 }))
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
    res.json({ source: req.params.source, content: ordered.map(o => o.text).join('\n\n'), chunks: points.length });
  } catch (e) {
    console.error('Document content error', e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/kb/documents/:source', async (req, res) => {
  try {
    await qdrant.delete(activeCollectionName, { filter: sourceFilterFor(req.params.source) });
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete error', e);
    res.status(500).json({ error: e.message });
  }
});

// Reassigns which section a document belongs to (e.g. "Zoho Book FAQ") --
// updates the field on every existing chunk in one filtered request rather
// than needing to know individual point IDs.
app.post('/api/kb/documents/:source/section', async (req, res) => {
  try {
    const { section } = req.body || {};
    await qdrant.setPayload(activeCollectionName, {
      payload: { [PAYLOAD_SECTION_KEY]: section || '' },
      filter: sourceFilterFor(req.params.source)
    });
    res.json({ ok: true, source: req.params.source, section: section || '' });
  } catch (e) {
    console.error('Set section error', e);
    res.status(500).json({ error: e.message });
  }
});

// Semantic search scoped to one document (or the whole active collection if
// no source given) -- returns just the top-K relevant chunks, not the whole
// file. Used by the Domain/Tools "Send to AI" check to ground tool-fit in
// tools.json without dumping the entire file into the prompt.
app.post('/api/kb/search', async (req, res) => {
  try {
    const { query, apiKey, embedModel, source, topK, embedProvider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey } = req.body || {};
    if (!query || !query.trim()) return res.status(400).json({ error: 'query is required.' });
    const [qEmbedding] = await embedTexts([query], apiKey, embedModel, embedProvider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey);
    const filter = source ? sourceFilterFor(source) : undefined;
    const limit = topK || 5;

    let chunks = [];
    for (const collName of activeCollectionNames) {
      try {
        const vectorConfig = await getVectorConfig(collName).catch(() => null);
        const results = await queryPoints(collName, { vector: qEmbedding, vectorConfig, limit, filter });
        results.forEach(r => chunks.push({ text: r.payload.text, source: r.payload[PAYLOAD_FILE_KEY], score: r.score }));
      } catch (e) {
        console.warn(`KB search failed for collection "${collName}", skipping it:`, e.message);
      }
    }
    chunks.sort((a, b) => (b.score || 0) - (a.score || 0));
    chunks = chunks.slice(0, limit);
    res.json({ chunks });
  } catch (e) {
    console.error('Search error', e);
    if (String(e.message).includes('404') || String(e.message).toLowerCase().includes('not found')) {
      return res.json({ chunks: [] });
    }
    res.status(500).json({ error: e.message });
  }
});

// Lists every collection in the connected Qdrant instance, and which one
// Ask AI/uploads are using. Matters most when the same Qdrant instance
// holds collections from other projects/scripts too.
app.get('/api/kb/collections', async (req, res) => {
  try {
    const { collections } = await qdrant.getCollections();
    const withCounts = await Promise.all(collections.map(async c => {
      let count = null;
      try { const r = await qdrant.count(c.name, { exact: false }); count = r.count; } catch (e) { /* ignore */ }
      return { name: c.name, count };
    }));
    res.json({ collections: withCounts, active: activeCollectionNames, primary: activeCollectionName });
  } catch (e) {
    console.error('List collections error', e);
    res.status(500).json({ error: e.message });
  }
});

// Toggles one collection's membership in the multi-select search scope Ask
// AI uses. Turning one ON also makes it the "primary" collection (uploads,
// the Reference documents table, tools.json lookup) -- the most recently
// activated one, so a single-collection workflow behaves exactly as a plain
// select always did. Never allows the set to go fully empty.
app.post('/api/kb/collections/toggle', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required.' });
    let next;
    if (activeCollectionNames.includes(name)) {
      next = activeCollectionNames.filter(n => n !== name);
      if (!next.length) next = [name]; // keep at least one active
    } else {
      next = [name, ...activeCollectionNames];
    }
    setActiveCollections(next);
    res.json({ ok: true, active: activeCollectionNames, primary: activeCollectionName });
  } catch (e) {
    console.error('Toggle collection error', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/kb/collections/create', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required.' });
    const trimmed = name.trim();
    try {
      await qdrant.getCollection(trimmed);
      return res.status(400).json({ error: `A collection named "${trimmed}" already exists.` });
    } catch (e) { /* good, doesn't exist yet -- proceed */ }
    // Vector size is unknown until the first upload -- created lazily then
    // (ensureCollection). Just activate it now (as primary); it'll be
    // created in Qdrant on first use.
    setActiveCollections([trimmed, ...activeCollectionNames]);
    res.json({ ok: true, active: activeCollectionNames, primary: activeCollectionName, note: 'Will be created on your first upload to it.' });
  } catch (e) {
    console.error('Create collection error', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ask', async (req, res) => {
  const { question, apiKey, model, embedModel, sources, chatProvider, embedProvider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey, history, ollamaContextLength } = req.body || {};
  // Validation happens before any response is sent, so these are still
  // normal JSON error responses -- only the answer itself streams.
  if (!question || !question.trim()) return res.status(400).json({ error: 'Question is required.' });
  if (chatProvider === 'custom' && (!customApiUrl || !customApiUrl.trim())) return res.status(400).json({ error: 'Add your Custom API base URL in Setup first.' });
  if (chatProvider === 'custom' && !customApiKey) return res.status(400).json({ error: 'Add your Custom API key in Setup first.' });
  if (chatProvider === 'nvidia' && !nvidiaApiKey) return res.status(400).json({ error: 'Add your NVIDIA NIM API key in Setup first.' });
  if (chatProvider !== 'ollama' && chatProvider !== 'custom' && !apiKey) return res.status(400).json({ error: 'Add your OpenRouter API key in Setup first.' });
  if (!model) return res.status(400).json({ error: 'Choose a chat model in Setup first.' });
  if (!embedModel) return res.status(400).json({ error: 'Choose an embedding model in Setup first.' });

  // Recent turns only (a handful is plenty for both purposes below, and
  // keeps the retrieval query from ballooning on a long-running chat).
  const recentHistory = Array.isArray(history) ? history.slice(-8) : [];

  try {
    // A vague follow-up ("explain them fully", "what about pricing?") means
    // almost nothing on its own as a search query -- it only makes sense
    // together with what was just being discussed. Embedding the bare
    // question alone was retrieving whatever loosely matched those generic
    // words across the whole Knowledge Base, not the actual prior topic.
    // Folding the last couple of turns into the embedded query fixes that.
    const lastTurn = recentHistory.slice(-2).map(h => h.text).join('\n');
    const searchQuery = lastTurn ? `${lastTurn}\n${question}` : question;
    const [qEmbedding] = await embedTexts([searchQuery], apiKey, embedModel, embedProvider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey);

    // If the person scoped this question to specific documents (Ask AI's
    // "Documents" picker), restrict retrieval to just those sources instead
    // of searching the whole active collection.
    const sourceFilter = Array.isArray(sources) && sources.length
      ? { must: [{ key: PAYLOAD_FILE_KEY, match: { any: sources } }] }
      : undefined;

    // Retrieve relevant Knowledge Base chunks -- across every collection
    // currently checked in the Knowledge Base card's multi-select, not just
    // one, merged together by relevance score.
    let contextChunks = [];
    for (const collName of activeCollectionNames) {
      try {
        const vectorConfig = await getVectorConfig(collName).catch(() => null);
        const results = await queryPoints(collName, {
          vector: qEmbedding,
          vectorConfig,
          limit: 10,
          filter: sourceFilter
        });
        results.forEach(r => contextChunks.push({
          text: r.payload.text,
          source: r.payload[PAYLOAD_FILE_KEY] || 'unknown',
          chunkIndex: r.payload[PAYLOAD_CHUNK_KEY],
          collection: collName,
          score: r.score
        }));
      } catch (e) {
        console.warn(`KB query failed for collection "${collName}", skipping it:`, e.message);
      }
    }
    contextChunks.sort((a, b) => (b.score || 0) - (a.score || 0));
    contextChunks = contextChunks.slice(0, 10);

    // A single retrieved chunk can be only half of the actual answer -- a
    // procedure, list, or section that happens to span a chunk boundary
    // means the top match alone may be missing the steps that come right
    // before/after it, silently inviting the model to fill the gap from
    // its own general knowledge instead of what the document actually
    // says (exactly what produced a confidently wrong, differently-named
    // procedure once). Pulling in the immediate neighbor chunks for the
    // top few matches reassembles that context before it ever reaches the
    // model, at the cost of a few extra small lookups per question.
    const topForExpansion = contextChunks.slice(0, 4);
    const neighborLookups = [];
    topForExpansion.forEach(c => {
      if (c.chunkIndex == null) return;
      [c.chunkIndex - 1, c.chunkIndex + 1].forEach(idx => {
        if (idx < 0) return;
        neighborLookups.push(
          scrollAll(c.collection, {
            must: [
              { key: PAYLOAD_FILE_KEY, match: { value: c.source } },
              { key: PAYLOAD_CHUNK_KEY, match: { value: idx } }
            ]
          }, 1).then(points => points.map(p => ({
            text: p.payload.text,
            source: p.payload[PAYLOAD_FILE_KEY] || c.source,
            chunkIndex: p.payload[PAYLOAD_CHUNK_KEY],
            collection: c.collection,
            score: c.score - 0.0001 // sorts just after the match that pulled it in, never displaces a genuine top hit
          }))).catch(() => [])
        );
      });
    });
    if (neighborLookups.length) {
      const neighborResults = (await Promise.all(neighborLookups)).flat();
      const seen = new Set(contextChunks.map(c => c.source + '::' + c.chunkIndex));
      neighborResults.forEach(n => {
        const key = n.source + '::' + n.chunkIndex;
        if (!seen.has(key)) { seen.add(key); contextChunks.push(n); }
      });
    }

    // Reorder for readability -- grouped by source and chunk sequence
    // (a reassembled procedure reads correctly top-to-bottom) rather than
    // strictly by score, now that neighbors are mixed in.
    contextChunks.sort((a, b) => {
      if (a.source !== b.source) return (b.score || 0) - (a.score || 0);
      return (a.chunkIndex || 0) - (b.chunkIndex || 0);
    });

    const contextBlock = contextChunks
      .map((c, i) => `[${i + 1}] (from ${c.source})\n${c.text}`)
      .join('\n\n');

    const system = `You are a helpful assistant embedded in a business proposal tool, having an ongoing conversation with the user -- treat prior turns as real context (e.g. "explain that further" refers to whatever was just discussed, not a fresh unrelated topic). Answer the user's latest question directly and concisely.

If Knowledge Base context is provided below, it is the ONLY source of truth for this answer -- follow these rules strictly:
- Use ONLY what the context actually says. Do not supplement, correct, "improve", or fill gaps using your own trained knowledge of the product/topic, even if you're confident you know the real procedure -- your training data may describe a different version, a different plan/edition, or a similar-sounding but different feature than what this specific document covers. If the context conflicts with what you know, the context wins, always.
- Preserve exact steps, button/field names, and order from the context rather than paraphrasing them from memory -- a procedure's specific wording matters, and reformulating it from general familiarity with the product is exactly how a subtly wrong answer happens.
- If the retrieved context looks incomplete or cut off (e.g. a procedure that seems to be missing its first or last steps), say so explicitly and answer only as far as the context actually covers, rather than quietly completing it yourself.
- Mention which source(s) you used. Never invent a source citation for something not present in the provided context.

If the context is empty or genuinely not relevant to the question, answer from your own general knowledge instead, and say plainly that you're doing so (this is the only situation where general knowledge is appropriate).`;

    const userContent = contextBlock
      ? `KNOWLEDGE BASE CONTEXT (ordered by document and section -- may include adjacent excerpts around the best match, to avoid cutting a procedure in half):\n"""\n${contextBlock}\n"""\n\nQUESTION: ${question}`
      : `QUESTION: ${question}\n\n(No relevant Knowledge Base context was found — answer from general knowledge.)`;

    // From here on, everything streams as Server-Sent Events instead of one
    // JSON blob -- the browser renders the answer token-by-token as it's
    // generated, same as any modern AI chat UI.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // disables any reverse-proxy response buffering, if one's ever added in front of this
    });
    const sourcesUsed = [...new Set(contextChunks.map(c => c.source))];
    res.write(`data: ${JSON.stringify({ type: 'meta', usedKnowledgeBase: contextChunks.length > 0, sources: sourcesUsed })}\n\n`);

    let answer = '';
    try {
      const priorTurns = recentHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text }));
      answer = await callChatCompletionStreaming(
        [{ role: 'system', content: system }, ...priorTurns, { role: 'user', content: userContent }],
        { apiKey, model, provider: chatProvider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey, temperature: 0.4, maxTokens: 900, ollamaContextLength },
        delta => res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`)
      );
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
      return res.end();
    }

    // Document this Q&A pair back into Qdrant, so the conversation itself
    // becomes searchable knowledge for future questions.
    try {
      const qaText = `Q: ${question}\nA: ${answer}`;
      const [qaEmbedding] = await embedTexts([qaText], apiKey, embedModel, embedProvider, ollamaUrl, customApiUrl, customApiKey, nvidiaApiKey);
      await ensureCollection(CHAT_HISTORY_COLLECTION, qaEmbedding.length);
      const chatVectorConfig = await getVectorConfig(CHAT_HISTORY_COLLECTION);
      if (chatVectorConfig.size && qaEmbedding.length !== chatVectorConfig.size) {
        // chat_history was created earlier under a different embedding
        // model/dimension than what's active now -- upserting would just
        // fail with a Qdrant "Bad Request". Skip it cleanly rather than
        // erroring on every question; the answer itself is unaffected.
        // Logged once per server run, not on every single question.
        if (!chatHistoryDimensionWarned) {
          chatHistoryDimensionWarned = true;
          console.warn(
            `Skipping chat_history logging: current embedding is ${qaEmbedding.length}-dim but ` +
            `"${CHAT_HISTORY_COLLECTION}" expects ${chatVectorConfig.size}-dim (created earlier with a ` +
            `different embedding model). Switch back to that model, or delete the "${CHAT_HISTORY_COLLECTION}" ` +
            `collection in Qdrant to let it be recreated fresh at the current dimension. (This warning won't repeat again this session.)`
          );
        }
      } else {
        await qdrant.upsert(CHAT_HISTORY_COLLECTION, {
          points: [{
            id: uuidv4(),
            vector: toPointVector(chatVectorConfig, qaEmbedding),
            payload: { [PAYLOAD_FILE_KEY]: 'chat_history', askedAt: new Date().toISOString(), usedKb: contextChunks.length > 0, text: qaText }
          }]
        });
      }
    } catch (e) {
      console.warn('Could not log Q&A to Qdrant:', e.message);
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (e) {
    console.error('Ask error', e);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

const server = app.listen(PORT, () => {
  console.log(`Knowledge Base API listening on http://localhost:${PORT}`);
  console.log(`Connecting to Qdrant at ${QDRANT_URL}, collection "${activeCollectionName}"`);
});
// A very large upload (thousands of chunks) can take several minutes to
// embed, sequentially, before this server ever sends a response back to the
// browser -- Node's default request/header timeouts would otherwise kill
// that connection partway through, unrelated to anything actually going
// wrong. Disabled entirely; the browser-side XHR has no timeout of its own
// either, so the request just runs to completion.
server.requestTimeout = 0;
server.headersTimeout = 0;
