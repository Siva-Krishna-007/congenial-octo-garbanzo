/* Talks to OpenRouter. Only asks the model for narrative text —
   all financial figures are computed locally in costing.js and injected afterward. */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function testOpenRouterKey(apiKey) {
  if (!apiKey) throw new Error('Enter an API key first.');
  // Validates the key itself (balance/rate-limit info), with no model/provider
  // routing involved -- avoids false failures when a specific model's
  // upstream provider (e.g. a particular free-tier host) is temporarily down.
  const res = await fetch('https://openrouter.ai/api/v1/key', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + apiKey }
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 200));
  }
  return res.json();
}

function buildSystemPrompt() {
  return `You are a senior proposal writer at an implementation/consulting firm. You read a preliminary/discovery document in full and produce BOTH the client details AND the full proposal narrative from it, in the voice of the reference proposal format described below. You NEVER invent prices, hours, discounts, or totals — those are supplied separately and are out of scope for you to state or change.

Return ONLY a single JSON object (no markdown fences, no commentary) with exactly these keys:

{
  "clientCompany": "the client/customer organisation's name, exactly as found in the document — never the vendor/consultant preparing the document",
  "clientContact": "the named person the document is prepared for, if any, else \\"\\"",
  "clientIndustry": "short 2-5 word sector description inferred from the document, e.g. 'corrugated packaging manufacturing'",
  "docNumber": "an explicit document number printed in the text, else \\"\\"",
  "docTitle": "CLIENT COMPANY NAME IN CAPS",
  "docSubtitle": "short one-line description of the system/engagement being proposed",
  "section1_heading": "short punchy heading for section 1, in the style of 'The Foundation Is Strong. The Next Step Is Clarity.'",
  "section1_body": ["paragraph 1", "paragraph 2", "paragraph 3", "paragraph 4"],
  "section2_heading": "heading for section 2, in the style of 'Where This System Will Transform <Client>'s Operations'",
  "section2_intro": "one paragraph intro",
  "subsections": [
    {
      "number": "2.1",
      "heading": "short benefit-oriented heading",
      "body": ["paragraph(s) describing the current pain point and how the new system solves it"],
      "calloutHeading": "short label like 'What the industry data shows:'",
      "calloutBody": "1-3 sentences of a plausible, appropriately-hedged industry benchmark or outcome relevant to this subsection (do not state it as a certainty; keep it directionally realistic)"
    }
  ],
  "section3_intro": "one paragraph introducing the solution/what gets configured",
  "section3_rows": [
    {"item": "capability name", "detail": "what gets configured specifically for this client"}
  ],
  "section4_intro": "one paragraph on how the engagement is run",
  "section6_notes": ["key note 1", "key note 2", "key note 3", "key note 4"],
  "section8_heading": "heading for the closing/next-step section",
  "section8_body": ["paragraph 1", "paragraph 2"],
  "promiseHeading": "Our Promise to <Client Company>",
  "promiseBody": "2-3 sentence promise paragraph in a warm, trustworthy, non-salesy tone"
}

Rules:
- Read the ENTIRE preliminary document provided by the user below before answering — it is the only source of truth for both the client fields and the narrative.
- If a client field genuinely cannot be determined from the document, use an empty string "" for it — never invent a company name, contact name, or document number.
- Produce 4 to 6 items in "subsections", each mapping to a real operational theme found in the preliminary notes.
- Produce 5 to 8 items in "section3_rows", each a concrete configured capability.
- The full topic range a proposal can draw on (weave whichever are actually relevant into "subsections"/"section3_rows" content, not as literal separate headings — the schema above is the fixed structure): ${docSectionsText('proposal')}.
- Ground every claim in the preliminary notes. Do not fabricate facts not implied by the notes.
- Keep paragraphs concise and confident, avoiding hype words like "revolutionary" or "game-changing".
- Do not include a section about pricing, investment, payment schedule, or licence costs — that is handled separately.
- Output strictly valid, compact JSON only — no markdown fences, no comments, no trailing commas.
- Every string value must be a single line: never put a literal line break inside a string. If a value needs multiple sentences, keep them in one line separated by spaces, or split into separate array items.`;
}

// Shared by both Proposal and SOW generation -- folds in whichever
// solution(s) were accepted in Solution Suggestions (Document step), so
// the generated document reflects the actual approach/tools chosen there
// rather than re-deriving everything from the DRD alone.
function acceptedSolutionsText() {
  const accepted = (STATE.solutions || []).filter(s => s.status === 'accepted');
  if (!accepted.length) return '';
  return accepted.map(s =>
    `- ${s.name}: ${s.description} (Tools: ${(s.tools || []).join(', ') || 'none specified'})`
  ).join('\n');
}

function buildUserPrompt() {
  const s = STATE.settings;
  const solutionsText = acceptedSolutionsText();
  return `PREPARED BY (the vendor writing this proposal, not the client): ${s.providerName}

DETAILED REQUIREMENT DOCUMENT (read this in full — it is the only source of truth):
"""
${STATE.drdText || '(no document text provided)'}
"""
${solutionsText ? `\nACCEPTED SOLUTION APPROACH (from Solution Suggestions -- reflect this specific approach, don't re-derive a different one):\n"""\n${solutionsText}\n"""\n` : ''}
Extract the client details and write the JSON object described in the system prompt, grounded entirely in the document above.`;
}

function extractJson(text) {
  let t = text.trim();
  t = t.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Model did not return JSON.');
  const candidate = t.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch (firstErr) {
    // Models often emit literal newlines/tabs inside JSON string values, which is invalid JSON.
    // Walk the text and escape control characters only while inside a string literal.
    const repaired = sanitizeJsonControlChars(candidate).replace(/,(\s*[\]}])/g, '$1');
    try {
      return JSON.parse(repaired);
    } catch (secondErr) {
      const pos = Number((String(secondErr.message).match(/position (\d+)/) || [])[1]);
      const around = isNaN(pos) ? '' : repaired.slice(Math.max(0, pos - 80), pos + 80);
      throw new Error('Model returned malformed JSON and it could not be auto-repaired. ' +
        secondErr.message + (around ? ' — near: ...' + around + '...' : ''));
    }
  }
}

function sanitizeJsonControlChars(text) {
  let out = '';
  let inString = false;
  let escaping = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaping) { out += ch; escaping = false; continue; }
      if (ch === '\\') { out += ch; escaping = true; continue; }
      if (ch === '"') { inString = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') { inString = true; out += ch; continue; }
      out += ch;
    }
  }
  return out;
}

// Matches the Ollama backend actually crashing (llama-server process dying,
// usually a GPU/CUDA driver issue on the machine) -- distinct from a normal
// HTTP error, and worth one automatic retry since Ollama typically respawns
// the subprocess on the next request.
function looksLikeOllamaCrash(text) {
  return /process has terminated|CUDA error|overrun|access violation/i.test(text || '');
}

// Parses a full response body already known to be in SSE format ("data:
// {...}\n\ndata: {...}\n\ndata: [DONE]") into accumulated content -- used
// when a gateway sends SSE even though non-streaming was requested (a full
// text blob, not incremental chunks, so no onDelta callbacks here).
function parseSseText(text) {
  let full = '';
  let finishReason = null;
  let reasoningLen = 0;
  text.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const json = JSON.parse(payload);
      const choice = json.choices && json.choices[0];
      const delta = (choice && choice.delta && choice.delta.content) || (choice && choice.message && choice.message.content);
      if (delta) full += delta;
      else {
        const r = (choice && choice.delta && choice.delta.reasoning_content) || (choice && choice.message && choice.message.reasoning_content);
        if (r) reasoningLen += r.length; // reasoning models (see attempt()'s streaming branch above) -- tracked for diagnostics only, not substituted as content in this JSON-focused pipeline
      }
      if (choice && choice.finish_reason) finishReason = choice.finish_reason;
    } catch (e) { /* partial/non-JSON chunk boundary -- ignore */ }
  });
  return { content: full, finishReason, reasoningLen };
}

async function callOpenRouterRaw(messages, { maxTokens = 4000, temperature = 0.6, wantJson = false, returnMeta = false, onDelta = null } = {}) {
  const usingOllama = isOllamaChat();
  const usingCustom = isCustomApiChat();
  const model = activeModel();
  const usingNvidia = isNvidiaChat();
  const apiKey = usingCustom ? STATE.settings.customApiKey : usingNvidia ? STATE.settings.nvidiaApiKey : STATE.settings.apiKey;
  if (!usingOllama && !apiKey) throw new Error(usingCustom ? 'Add your OmniRoute API key in Setup first.' : usingNvidia ? 'Add your NVIDIA NIM API key in Setup first.' : 'Add your OpenRouter API key in Setup first.');
  if (usingCustom && !customApiBaseUrl()) throw new Error('Add your OmniRoute base URL in Setup first.');
  if (!model) throw new Error(
    usingOllama ? 'Enter an Ollama chat model in Setup first.' :
    usingCustom ? 'Enter a model id for your OmniRoute setup in Setup first.' :
    usingNvidia ? 'Enter a model id for your NVIDIA NIM setup in Setup first.' :
    'Choose or enter a model in Setup first.'
  );
  const url = usingOllama ? ollamaBaseUrl() + '/v1/chat/completions'
    : usingCustom ? customApiBaseUrl() + '/chat/completions'
    : usingNvidia ? NVIDIA_BASE_URL + '/chat/completions'
    : OPENROUTER_URL;
  const providerLabel = usingOllama ? 'Ollama' : usingCustom ? 'OmniRoute' : usingNvidia ? 'NVIDIA NIM' : 'OpenRouter';
  const wantStream = typeof onDelta === 'function';

  async function call(withResponseFormat, streaming, maxTokensOverride) {
    const body = { model, messages, temperature, max_tokens: maxTokensOverride || maxTokens };
    if (withResponseFormat) body.response_format = { type: 'json_object' };
    if (streaming) body.stream = true;
    // Ollama-only, set in Admin > LLM Context. Passed as a top-level field
    // alongside the normal OpenAI-compatible request -- recent Ollama
    // versions may honor it as an extension; harmlessly ignored if not.
    // Never applied to OpenRouter, which manages its own context server-side.
    if (usingOllama && STATE.settings.ollamaContextLength) {
      const ctx = parseInt(STATE.settings.ollamaContextLength, 10);
      if (ctx > 0) body.num_ctx = ctx;
    }
    const headers = { 'Content-Type': 'application/json' };
    if (!usingOllama) headers['Authorization'] = 'Bearer ' + apiKey; // OpenRouter, OmniRoute, and NVIDIA NIM all need this; Ollama (local, no auth) doesn't
    if (usingCustom) headers['x-omniroute-compression'] = 'off'; // OmniRoute's own automatic prompt-compression pipeline (Caveman/RTK/etc, docs: diegosouzapw/OmniRoute) is tuned for coding-agent content -- terminal output, git diffs, JSON tool logs -- and can misdetect/mangle a large structured prompt like ours (which deliberately contains a literal JSON schema template the model needs to follow exactly). Disabled for our requests specifically; a no-op for OpenRouter/Ollama, which just ignore an unrecognized header.
    return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  async function callWithNetworkErrorHandling(withResponseFormat, streaming, maxTokensOverride) {
    try {
      return await call(withResponseFormat, streaming, maxTokensOverride);
    } catch (networkErr) {
      console.error(providerLabel + ' network error', networkErr);
      throw new Error(usingOllama
        ? `Could not reach Ollama at ${ollamaBaseUrl()}. Make sure "ollama serve" is running, and if this is a CORS error in the console, start it with OLLAMA_ORIGINS=* set. Details: ${networkErr.message}`
        : usingCustom
        ? `Could not reach ${customApiBaseUrl()}. Check the base URL and your internet connection, and if this is a CORS error in the console, that API needs to allow requests from this page's origin. Details: ${networkErr.message}`
        : usingNvidia
        ? `Could not reach NVIDIA NIM. Check your internet connection and API key. Details: ${networkErr.message}`
        : 'Could not reach OpenRouter (network/CORS error). Check your internet connection and API key. Details: ' + networkErr.message);
    }
  }

  // Runs one full attempt (network + HTTP status + Ollama-crash handling +
  // streaming-or-not parsing) and always returns a result shape rather than
  // throwing for an empty response -- empty content is a valid outcome the
  // caller below decides how to react to (retry with different flags, or
  // finally give up), since ok=200-but-empty is exactly what a multi-provider
  // gateway does when the model it routed to can't handle a flag it was sent.
  async function attempt(withResponseFormat, streaming, maxTokensOverride) {
    let res = await callWithNetworkErrorHandling(withResponseFormat, streaming, maxTokensOverride);

    if (!res.ok) {
      const t = await res.text();
      if (usingOllama && looksLikeOllamaCrash(t)) {
        console.warn(providerLabel + ' backend crashed, retrying once after a short pause...', t.slice(0, 200));
        await new Promise(r => setTimeout(r, 1500));
        res = await callWithNetworkErrorHandling(withResponseFormat, streaming, maxTokensOverride);
        if (!res.ok) {
          const t2 = await res.text();
          if (looksLikeOllamaCrash(t2)) {
            throw new Error(
              `Ollama's local model backend keeps crashing (likely a GPU/CUDA driver issue on this machine, not something this app can fix directly). ` +
              `Things worth trying: update your NVIDIA drivers, restart Ollama, force CPU mode (set OLLAMA_NO_CUDA=1 before "ollama serve"), or try a different/smaller model. ` +
              `Raw error: ${t2.slice(0, 200)}`
            );
          }
          console.error(providerLabel + ' error response (after retry)', res.status, t2);
          throw new Error(`${providerLabel} error ${res.status}: ${t2.slice(0, 300)}`);
        }
      } else {
        console.error(providerLabel + ' error response', res.status, t);
        throw new Error(`${providerLabel} error ${res.status}: ${t.slice(0, 300)}`);
      }
    }

    if (!streaming) {
      const text = await res.text();
      // Try plain JSON first (the normal case for a real non-streaming
      // response). If that fails, this gateway sent SSE format anyway
      // (seen with OmniRoute, which appears to always stream regardless
      // of the stream:false request) -- fall back to extracting content
      // from "data: {...}" lines the same way the real streaming path does,
      // just without incremental onDelta callbacks since it all arrived at
      // once.
      try {
        const data = JSON.parse(text);
        const choice = data.choices && data.choices[0];
        const content = (choice && choice.message && choice.message.content) || '';
        const reasoningNote = (!content && choice && choice.message && choice.message.reasoning_content)
          ? ` (model produced ${choice.message.reasoning_content.length} chars of reasoning/thinking content but never reached a final answer -- it may need more completion budget)` : '';
        return { content, finishReason: choice && choice.finish_reason, raw: reasoningNote ? JSON.stringify(data).slice(0, 400) + reasoningNote : data };
      } catch (parseErr) {
        const { content, finishReason, reasoningLen } = parseSseText(text);
        if (content) return { content, finishReason, raw: text.slice(0, 500) };
        const reasoningNote = reasoningLen ? ` (model produced ${reasoningLen} chars of reasoning/thinking content but never reached a final answer -- it may need more completion budget)` : '';
        console.error(providerLabel + ' response was neither valid JSON nor a recognizable SSE stream', text.slice(0, 500));
        return { content: '', finishReason: null, raw: text.slice(0, 500) + reasoningNote };
      }
    }

    // Streaming: parse Server-Sent-Events-style chunks (data: {...}\n\n,
    // ending with data: [DONE]) and hand each text delta to onDelta as it
    // arrives.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let finishReason = null;
    let buffer = '';
    let routedModel = null;
    let reasoning = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // last (possibly incomplete) line stays buffered for next chunk
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          if (json.model && !routedModel) routedModel = json.model; // which underlying model a gateway actually routed to -- can differ from the "auto/..." alias requested, and matters a lot for diagnosing a specific bad model (e.g. a known-unstable free one)
          const choice = json.choices && json.choices[0];
          const delta = choice && choice.delta && choice.delta.content;
          if (delta) { full += delta; onDelta(delta, full); }
          else if (choice && choice.delta && choice.delta.reasoning_content) { reasoning += choice.delta.reasoning_content; } // reasoning models (NVIDIA nemotron w/ enable_thinking, DeepSeek-R1-style) put thinking here, separate from the final answer -- fallen back to below if content never arrives
          if (choice && choice.finish_reason) finishReason = choice.finish_reason;
        } catch (e) { /* partial/non-JSON chunk boundary -- ignore and keep reading */ }
      }
    }
    return { content: full, finishReason, routedModel, raw: full ? undefined : `(streamed response, model routed to: ${routedModel || 'unknown'}, ${buffer.length} bytes still buffered, finishReason=${finishReason}${reasoning ? `, model produced ${reasoning.length} chars of reasoning/thinking content but never reached a final answer -- it may need more completion budget` : ''})` };
  }

  let result = await attempt(wantJson, wantStream);

  if (!result.content && wantJson) {
    // Some gateways (seen with OmniRoute) return 200 OK with empty content
    // rather than an error when the model they routed to can't actually
    // honor response_format:json_object on a large/complex prompt -- the
    // old retry only fired on HTTP 400/422, which never happens here since
    // the request "succeeds". Retry once without it before giving up.
    console.warn(providerLabel + ' returned empty content with response_format set -- retrying without it');
    result = await attempt(false, wantStream);
  }
  if (!result.content && wantStream) {
    // Likewise, some gateways' SSE streaming implementation is less
    // reliable than their plain (non-streaming) path. Retry once
    // non-streaming before finally giving up -- onDelta simply won't fire
    // for this final attempt, which is a fine trade for actually getting
    // an answer back.
    console.warn(providerLabel + ' returned empty content while streaming -- retrying non-streaming');
    result = await attempt(false, false);
  }
  if (!result.content && maxTokens > 2000) {
    // Last resort: some gateways/underlying models silently fail (rather
    // than erroring) when max_tokens is set high on an already-large
    // prompt -- close to or past whatever context window they actually
    // have. Retry with a much smaller budget to see if that's what's
    // going on, rather than only ever trying the one large value.
    console.warn(providerLabel + ` returned empty content at max_tokens=${maxTokens} -- retrying with a smaller budget`);
    result = await attempt(false, false, 1500);
  }

  if (!result.content) {
    // Surface whatever diagnostic detail is actually available directly in
    // the thrown error (not just the console) -- a generic message here
    // just leads to another round of guessing next time this happens.
    const diag = typeof result.raw === 'string' ? result.raw.slice(0, 200) : (result.raw ? JSON.stringify(result.raw).slice(0, 200) : '(no response body captured)');
    const modelNote = result.routedModel ? `${providerLabel} routed this to "${result.routedModel}" -- if that model keeps coming back empty, try excluding it from auto-routing or setting an explicit model instead. ` : '';
    console.error(providerLabel + ' returned no content after all retries', result.raw || '');
    throw new Error(
      `No content returned by ${providerLabel} after trying with/without structured-output mode, streaming/non-streaming, and a smaller token budget. ` +
      modelNote +
      `Last response captured: ${diag}`
    );
  }
  if (returnMeta) return { content: result.content, finishReason: result.finishReason };
  return result.content;
}

async function callOpenRouterJson(messages, opts = {}) {
  const maxTokens = opts.maxTokens || 4000;
  const { content, finishReason } = await callOpenRouterRaw(messages, { ...opts, wantJson: true, returnMeta: true });

  if (finishReason === 'length') {
    // The response got cut off mid-way -- this is the #1 cause of "malformed
    // JSON" (a truncated string/array, not a formatting quirk). Retrying
    // with the same token budget would just truncate again in the same
    // place, so bump it substantially instead.
    console.warn(`Response was truncated (finish_reason: length) at maxTokens=${maxTokens} -- retrying with more room.`);
    const retryTokens = Math.min(Math.round(maxTokens * 1.8) + 1000, 16000);
    const retry = await callOpenRouterRaw(messages, { ...opts, maxTokens: retryTokens, wantJson: true, returnMeta: true });
    return extractJson(retry.content);
  }

  try {
    return extractJson(content);
  } catch (e) {
    // Not a truncation, but still not valid JSON -- one retry with a blunt
    // reminder appended, rather than failing the whole request outright.
    console.warn('First JSON parse failed, retrying with a stronger reminder:', e.message);
    const retryMessages = [...messages, { role: 'user', content: 'Reminder: reply with ONLY the JSON object described above -- no prose, no markdown fences, nothing before or after it.' }];
    const retry = await callOpenRouterRaw(retryMessages, { ...opts, wantJson: true, returnMeta: true });
    if (retry.finishReason === 'length') {
      const retryTokens = Math.min(Math.round(maxTokens * 1.8) + 1000, 16000);
      const retry2 = await callOpenRouterRaw(retryMessages, { ...opts, maxTokens: retryTokens, wantJson: true, returnMeta: true });
      return extractJson(retry2.content);
    }
    return extractJson(retry.content);
  }
}

async function generateIntakeQuestions(onDelta) {
  if (!STATE.prelimText.trim()) throw new Error('Upload or paste the preliminary document first.');
  const system = `You read a preliminary/discovery document for a business proposal and identify gaps — useful information that is NOT already stated in the document. Produce TWO separate lists of clarifying questions, so the proposal can be written more accurately.

Every question, in both lists, must be phrased exactly as the company would ask it directly TO the client (second person, e.g. "How many users will need licenses?" not "Determine user count").

"generalQuestions" — go through the CURATED QUESTION BANK provided below (grouped by topic) and check each one against the document: if it's already answered (even partially, in spirit), skip it; if it's genuinely not covered, include it. Include every bank question that's actually missing. If, after covering the whole bank, there are additional obvious gaps the bank doesn't happen to cover, add a few more in the same spirit.

"toolQuestions" — at least 5 questions specifically about the client's CURRENT tools/systems, technical environment, and integration needs, grounded as much as possible in whatever the document already mentions about tools/software/systems (build on and dig deeper into what's there — e.g. if the document mentions a system by name, ask what they use it for or what's missing from it; if it mentions no tools at all, ask what they currently use today for the relevant processes). These exist to sanity-check the tool selection, so keep them concrete and specific rather than generic.

Do not ask about anything already answered in the document. Return ONLY a JSON object with exactly these keys: {"generalQuestions": ["...", "..."], "toolQuestions": ["...", "..."]}. Each item is a single-line question string, phrased as a direct question to the client. Output strictly valid, compact JSON only — no markdown fences, no commentary, no trailing commas.`;
  return callOpenRouterJson([
    { role: 'system', content: system },
    { role: 'user', content: `DOCUMENT:\n"""\n${STATE.prelimText}\n"""\n\nCURATED QUESTION BANK:\n${generalQuestionsBankText()}` }
  ], { maxTokens: 3200, temperature: 0.4, onDelta });
}
async function generateFullProposal(onDelta) {
  if (!STATE.drdText.trim()) throw new Error('Create the Detailed Requirement Document first.');
  return callOpenRouterJson([
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt() }
  ], { maxTokens: 4500, temperature: 0.5, onDelta });
}

async function analyzeDocumentChecklist(docType, prelimText, checklist, toolsWithDescriptions, toolsReferenceDoc, onDelta) {
  if (!prelimText || !prelimText.trim()) throw new Error('Upload or paste a document first.');
  if (!checklist || !checklist.length) throw new Error('No checklist to analyze.');
  const hasReferenceDoc = toolsReferenceDoc && toolsReferenceDoc.content;
  const sourcesLabel = hasReferenceDoc ? (toolsReferenceDoc.sources || []).join(', ') : '';
  const system = `Read this ${docType === 'requirement' ? 'requirement' : 'preliminary'} document for a business proposal closely and completely before answering -- every task below draws only on what it actually says, never invented or assumed. You're also given one or more Zoho tools the team has selected, each with its own written description${hasReferenceDoc ? `, plus authoritative TOOLS REFERENCE material (drawn from your uploaded Knowledge Base document(s): ${sourcesLabel}) that documents correct tool selection.` : '.'} Do all of the following in this one pass:

1) For EACH of the ${checklist.length} checklist questions below, decide whether the document already answers it (in spirit, not just keyword presence). If it does, extract/paraphrase a concise answer strictly grounded in the document (2-4 sentences max) -- never invent facts not present in the document. If the document does NOT answer it, leave the answer empty and mark it not met.

   EXCEPTION-AWARE JUDGING -- a full requirement document typically covers the sections listed below (grouped by document type: PRD = ${docSectionsText('prd')}; DRD = ${docSectionsText('drd')}). Several of these are explicitly CONDITIONAL -- Current/Proposed Hardware, Hardware Requirements, Software Requirements, Infrastructure Requirements, Data Migration -- meaning their absence is only a real gap when the engagement's actual nature calls for them. Reason about this explicitly: if the client is asking for a software application alone (a SaaS/cloud implementation with no physical equipment, on-prem servers, or device rollout involved), the absence of a Hardware Requirements / Current Hardware section is NOT a gap -- it's correctly not applicable, and a checklist item touching on it should be treated as met/not-applicable rather than flagged missing. Conversely, if the document DOES describe hardware, devices, on-prem infrastructure, or physical equipment (e.g. biometric devices, POS terminals, on-site servers) but never documents their specifications/requirements, that IS a real gap -- flag it. Apply the same reasoning to Data Migration (only a gap if there's existing data to migrate) and Integration Requirements (only a gap if third-party/other-system integration is actually implied). Where you judge something "not applicable" rather than "missing", say so explicitly in the answer text (e.g. "Not applicable -- this is a software-only engagement with no hardware component described") rather than leaving it blank as if simply unanswered.

2) Give a few practical suggestions for strengthening weak/missing answers -- including calling out explicitly if an exception above was applied (so the person reviewing understands why something wasn't flagged as a gap).
3) For EACH selected tool, judge whether it was selected CORRECTLY: ${hasReferenceDoc
    ? `primarily by checking it against the TOOLS REFERENCE material below -- if it specifies criteria, capabilities, or use-cases for this tool, use those as the authoritative standard, falling back to the tool's own description only where the reference material is silent on it.`
    : `by comparing its description against what the document actually describes needing.`} Judge FITS (correctly selected -- its documented capabilities genuinely match the document's needs) or DIFFERS (incorrectly selected -- the document describes something the tool doesn't support, or a mismatch in scale/use-case), and say why in one sentence.
4) Draft "generalQuestions" -- go through the CURATED QUESTION BANK below (grouped by topic) and check each one against the document: if it's already answered (even partially, in spirit), skip it; if it's genuinely not covered, include it as a question to ask the client. Include every bank question that's actually missing -- do not skip any just to shorten the list. If, after covering the whole bank, there are additional obvious gaps the bank doesn't happen to cover, add a few more in the same spirit.
5) Draft "toolQuestions" -- at least 5 clarifying questions specifically about the client's CURRENT tools/systems, technical environment, and integration needs, grounded as much as possible in whatever the document already mentions about tools/software/systems (build on and dig deeper into what's there -- e.g. if the document names a system, ask what they use it for or what's missing; if it mentions no tools at all, ask what they currently use today for the relevant processes). These exist to sanity-check the tool selection, so keep them concrete and specific rather than generic.

Every question in both lists 4 and 5 must be phrased exactly as the company would ask it directly TO the client (second person, e.g. "How many users will need licenses?" not "Determine user count"), and must not ask about anything already answered in the document.

Return ONLY a single JSON object, no markdown fences, no commentary:
{
  "generalQuestions": ["...", "..."],
  "toolQuestions": ["...", "..."],
  "suggestions": ["short actionable suggestion", "..."],
  "toolFit": [ { "tool": "tool name", "verdict": "fits" or "differs", "comment": "one short sentence saying whether it was selected correctly and why,${hasReferenceDoc ? ' citing the specific source document when it informed the verdict' : ' grounded in the tool description and the document'}" } ],
  "items": [ { "id": "the item id given", "met": true or false, "answer": "concise answer grounded in the document, or empty string if not met" } ]
}
Every "items" entry must use exactly the id given below, in the same order. Every "toolFit" entry must use exactly the tool name given below, in the same order. Keep every answer/comment/suggestion/question concise. Output strictly valid, compact JSON only -- no trailing commas. Generate the keys in the order listed above -- "generalQuestions" and "toolQuestions" MUST be complete (their full required count, never skipped or cut short) even if that means keeping "items" answers brief to fit.`;

  const itemsBlock = checklist.map(c => `ID: ${c.id}\nQUESTION: ${c.question}`).join('\n\n');
  const toolsBlock = (toolsWithDescriptions || []).map(t =>
    `TOOL: ${t.tool} (${t.domain})\nDESCRIPTION: ${(t.description || '(no description on file yet)').slice(0, 2000)}`
  ).join('\n\n') || '(none selected)';
  const referenceBlock = hasReferenceDoc
    ? `\n\nTOOLS REFERENCE (from your Knowledge Base, most relevant excerpts, each labeled with its source file):\n"""\n${toolsReferenceDoc.content.slice(0, 8000)}\n"""`
    : '';

  const user = `DOCUMENT:\n"""\n${prelimText}\n"""\n\nCHECKLIST QUESTIONS:\n${itemsBlock}\n\nCURATED QUESTION BANK (for generalQuestions -- check each against the document, include only what's missing):\n${generalQuestionsBankText()}\n\nSELECTED TOOLS:\n${toolsBlock}${referenceBlock}`;

  return callOpenRouterJson([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], { maxTokens: 7800, temperature: 0.3, onDelta });
}

// Generates a Scope of Work directly from a Detailed Requirement Document.
// Unlike the Proposal (a fixed JSON schema rendered through a template),
// this returns raw HTML straight from the model -- simpler, and doesn't
// lock in a section structure that likely won't match your real SOW
// template until you've shared an example to calibrate it against.
// Generates a Detailed Requirement Document from a preliminary document
// plus whatever checklist answers and Q&A the person has confirmed --
// folding confirmed facts in as first-class content, not just context.
// Returns plain text (paragraphs), matching how DRD content is edited
// elsewhere in the app (assets/main.js: textToEditableHtml/
// editableHtmlToText) -- deliberately not the rich JSON+template
// treatment used for Proposal/SOW, since a DRD is closer in spirit to the
// original preliminary document (a written record of requirements) than
// to a templated client-facing deliverable.
// Generates 2-4 candidate solution approaches for the DRD's requirements,
// each naming specific priced Zoho tools. Grounds in real past work
// (Knowledge Base > Previous Solutions documents) when any are on file --
// otherwise reasons from the priced tools list alone. Live web-search
// comparison (mentioned in the original request) isn't wired in here: it
// would need a search API key (Serper/Bing/Google Custom Search/etc.)
// this app doesn't have configured, so rather than fake it, this sticks
// to what's actually verifiable -- your own Knowledge Base and priced
// tool catalog.
async function generateDrdAndSolutions(prelimText, checklist, qa, previousSolutionsContext, availableToolsText, onDelta) {
  if (!prelimText || !prelimText.trim()) throw new Error('No document text to generate from.');

  const agreedAnswers = (checklist || []).filter(c => c.agreed && (c.answer || '').trim())
    .map(c => `Q: ${c.question}\nA: ${c.answer.trim()}`).join('\n\n');
  const answeredQa = [];
  ['general', 'tools'].forEach(bucket => {
    ((qa && qa[bucket]) || []).forEach(x => { if (x.a && x.a.trim()) answeredQa.push(`Q: ${x.q}\nA: ${x.a.trim()}`); });
  });
  const hasPastSolutions = previousSolutionsContext && previousSolutionsContext.content;
  const sourcesLabel = hasPastSolutions ? (previousSolutionsContext.sources || []).join(', ') : '';

  const system = `You are a business analyst. From a preliminary/discovery document -- plus whatever additional confirmed answers are provided -- produce TWO things in one pass: (1) a proper Detailed Requirement Document (DRD), and (2) candidate solution approaches for what the client needs.

THE DRD: a comprehensive, well-organized record of the client's business context, current operations, pain points, and functional requirements -- detailed enough that a proposal and scope of work could be written from it without going back to the client. Organize it using this section structure as a guide (skip any section the source material doesn't actually support -- never invent content to fill one in): ${docSectionsText('drd')}. Group related sections under sensible headings rather than mechanically listing all of them.

Several sections are explicitly CONDITIONAL (Hardware Requirements, Software Requirements, Infrastructure Requirements, Data Migration) -- only include them if the engagement's nature actually calls for them (a software-only/cloud engagement genuinely has no hardware section to write; don't fabricate one). If the source material is ambiguous about whether a conditional section applies, note that explicitly as an open question rather than guessing.

THE SOLUTIONS: 2 to 4 distinct viable approaches (tool combinations) addressing the requirements, so the team can pick one. Every tool named MUST come from the AVAILABLE TOOLS list below -- never invent a tool name or edition not present there.
${hasPastSolutions
    ? `You are given excerpts from PREVIOUS SOLUTION documents (real past engagements, from the Knowledge Base: ${sourcesLabel}) -- prioritize these where genuinely relevant (reuse an approach that worked before, adapted to this client), and set sourceType "kb" with the document named in sourceNote. If your own knowledge or any web results you have access to suggest a materially different approach worth comparing, include that as a separate candidate with sourceType "research" so the two can be compared side by side rather than blended into one answer.`
    : `No Previous Solutions documents are on file, so reason from the AVAILABLE TOOLS list, the requirements, and whatever current knowledge you have. Use sourceType "research" for those.`}

Return ONLY a single JSON object (no markdown fences, no commentary):
{
  "clientCompany": "the client organisation's name exactly as found -- never the vendor preparing the document",
  "clientContact": "the named person the document is prepared for, if any, else \\"\\"",
  "docNumber": "a document number/code if one is stated or implied, else \\"\\"",
  "docTagline": "short one-line description of the system/engagement",
  "introBody": "one short paragraph stating what this document captures and what it's based on",
  "solutions": [
    {
      "name": "short descriptive name for this approach",
      "description": "2-3 sentences on the approach and why it fits",
      "tools": ["exact tool name from AVAILABLE TOOLS", "..."],
      "requirementsAddressed": ["specific requirement this covers", "..."],
      "sourceType": "kb" or "research",
      "sourceNote": "which Previous Solution document or what informed this, else empty string"
    }
  ],
  "sections": [
    {
      "heading": "section name, e.g. 'Business Overview' or 'Functional Requirements'",
      "paragraphs": ["prose paragraph", "..."],
      "bullets": ["bullet point", "..."]
    }
  ]
}
Each section may use paragraphs, bullets, or both -- use bullets for genuine lists (requirements, pain points, stakeholders) and paragraphs for narrative. Leave the unused one as an empty array. Produce 8 to 20 sections covering what the source material actually supports.

Ground every statement in the source material -- the original document plus the confirmed answers are the only source of truth for the DRD. Fold confirmed answers in as first-class facts wherever they belong topically, not as a bolted-on appendix. Never invent details, numbers, or requirements not present in the source material. Output strictly valid, compact JSON only -- no trailing commas. Every string value must be a single line: never put a literal line break inside a string.`;

  const user = `ORIGINAL DOCUMENT:
"""
${prelimText}
"""
${agreedAnswers ? `\nCONFIRMED CHECKLIST ANSWERS (fold these in as confirmed facts):\n"""\n${agreedAnswers}\n"""\n` : ''}${answeredQa.length ? `\nADDITIONAL CONFIRMED ANSWERS (fold these in as confirmed facts):\n"""\n${answeredQa.join('\n\n')}\n"""\n` : ''}
AVAILABLE TOOLS (only use tool names from this list for solutions):
"""
${availableToolsText || '(none priced yet -- see Knowledge Base > Zoho tools & editions)'}
"""
${hasPastSolutions ? `\nPREVIOUS SOLUTION EXCERPTS:\n"""\n${previousSolutionsContext.content}\n"""\n` : ''}
Write the JSON object described in the system prompt, grounded entirely in the material above.`;

  return callOpenRouterJson([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], { maxTokens: 12000, temperature: 0.4, onDelta });
}

async function generateScopeOfWork(drdText, onDelta) {
  if (!drdText || !drdText.trim()) throw new Error('No document text to generate from.');
  const s = STATE.settings;
  const system = `You are a senior delivery/implementation lead at a consulting firm. You read a Detailed Requirement Document (DRD) in full and produce a Scope of Work (SOW) from it -- structured data only, in the voice of the reference SOW format described below. You NEVER invent prices, hours, discounts, or totals -- those are supplied separately and are out of scope for you to state or change.

Return ONLY a single JSON object (no markdown fences, no commentary) with exactly these keys:

{
  "clientCompany": "the client/customer organisation's name, exactly as found in the DRD -- never the vendor/consultant preparing the document",
  "clientContact": "the named person the document is prepared for, if any, else \\"\\"",
  "docNumber": "an explicit SOW document number/code if the DRD states or implies a numbering convention, else \\"\\"",
  "docTagline": "short one-line description of the system/engagement, e.g. 'Zoho One — Finance, Inventory & Production Visibility System'",
  "introBody": "one formal sentence/short paragraph stating this document defines the agreed scope, deliverables, exclusions, client dependencies, and timeline for the engagement",
  "purposeBody": ["1-2 paragraphs explaining what this SOW establishes -- what's included, excluded, what the client provides, and that anything not explicitly described is out of scope and would be quoted separately"],
  "sourceDocuments": ["short label(s) of the source document(s) this SOW is based on, e.g. the DRD itself -- keep generic if no specific document names/dates are given"],
  "notes": ["short key note, e.g. about GST/compliance exclusions, timeline being indicative, costs excluding tax, etc -- only ones genuinely relevant to this engagement"],
  "conclusionBody": ["1-2 closing paragraphs tying the engagement back to the client's specific situation and what the delivered system will give them"],
  "scopeGroups": [
    {
      "letter": "A",
      "heading": "short group heading, e.g. 'Organisation Setup & Configuration'",
      "items": ["one concrete, specific, configurable deliverable per item -- not vague filler"]
    }
  ],
  "exclusions": [
    { "number": "3.1", "heading": "short heading", "items": ["specific thing explicitly out of scope"] }
  ],
  "dependencies": [
    { "number": "4.1", "heading": "short heading, e.g. 'Access & Credentials' or 'Master Data'", "items": ["specific thing the CLIENT must provide/confirm"] }
  ],
  "timelineStages": [
    { "name": "Stage 1 — Solution Mapping & Blueprint", "activities": "what happens in this stage, grounded in the DRD's scope" }
  ]
}

Rules:
- Read the ENTIRE DRD provided by the user below before answering -- it is the only source of truth.
- If a field genuinely cannot be determined from the DRD, use an empty string "" (or empty array) for it -- never invent a company name, contact name, or document number.
- "scopeGroups": produce 4 to 10 lettered groups (A, B, C, ...), each with 3 to 10 items, covering the DRD's functional requirements as concrete configurable deliverables (mirror the DRD's own section structure where sensible, e.g. one group per functional area).
- The full topic range an SOW can draw on (weave whichever are actually relevant into the sections above -- the schema is the fixed structure, this is content inspiration, not literal extra headings): ${docSectionsText('sow')}.
- "exclusions": produce 3 to 6 numbered subsections (3.1, 3.2, ...), each grounded in what the DRD explicitly says is NOT covered, or standard adjacent scope not mentioned in the DRD's functional requirements (e.g. if the DRD only covers Finance/Inventory, note that HR/Payroll/CRM are excluded).
- "dependencies": produce 3 to 5 numbered subsections (4.1, 4.2, ...) covering what the client needs to provide (credentials, master data, approvals/availability) for the engagement to proceed.
- "timelineStages": produce 3 to 5 stages, always ending with a go-live/handover stage and (if the DRD implies ongoing support) a hypercare/stabilisation stage. Do not invent specific calendar dates -- describe activities and relative sequencing only.
- Keep every item/paragraph concise and concrete, grounded entirely in the DRD. Do not fabricate facts not implied by it.
- Do not include a section about pricing, investment, licence costs, or payment schedule -- that is handled separately using existing costing data, not generated by you.
- Generate the keys in the order listed above. "notes" and "conclusionBody" MUST both be fully populated (never empty, never omitted) -- they appear early in the schema deliberately so they are never lost if the response runs long; if space is tight, shorten the scopeGroups item wording rather than dropping these.
- Output strictly valid, compact JSON only -- no trailing commas. Every string value must be a single line: never put a literal line break inside a string.`;

  const solutionsText = acceptedSolutionsText();
  const user = `PREPARED BY (the vendor writing this SOW, not the client): ${s.providerName}

DETAILED REQUIREMENT DOCUMENT (read this in full -- it is the only source of truth):
"""
${drdText}
"""
${solutionsText ? `\nACCEPTED SOLUTION APPROACH (from Solution Suggestions -- reflect this specific approach in the scope, don't re-derive a different one):\n"""\n${solutionsText}\n"""\n` : ''}
Write the JSON object described in the system prompt, grounded entirely in the document above.`;

  return callOpenRouterJson([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], { maxTokens: 9000, temperature: 0.4, onDelta });
}

async function applyAiEdit(currentHtml, instruction, onDelta) {
  if (!instruction.trim()) throw new Error('Type an instruction first.');
  const system = `You are editing an HTML fragment of a business proposal document. Apply the user's editing instruction to it, changing only what the instruction implies (plus any directly necessary follow-on changes, such as renumbering a list). Preserve all existing HTML tags, class names, and table structure exactly as given — do not introduce new CSS classes or inline styles, do not remove tables or headings unless explicitly asked to. Output ONLY the raw, complete, corrected HTML fragment — no markdown fences, no commentary, no <html>/<head>/<body> wrapper, just the same fragment structure with the edit applied.`;
  const content = await callOpenRouterRaw([
    { role: 'system', content: system },
    { role: 'user', content: `INSTRUCTION: ${instruction}\n\nCURRENT HTML:\n"""\n${currentHtml}\n"""` }
  ], { maxTokens: 6000, temperature: 0.4, wantJson: false, onDelta });

  let html = content.trim();
  html = html.replace(/^```html/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  return html;
}
