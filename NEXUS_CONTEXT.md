# NEXUS — Complete Project Context

**Purpose:** This file is the single source of truth for restoring full context in a new conversation. It documents the entire project state exhaustively. Paste this file into every new Claude session to restore full context. Do not summarize or skip anything when using it.

---

## Quick Start (New Context Window)

1. **Prerequisites:** Node.js, Ollama (`ollama pull nomic-embed-text`), `.env.local` with `ANTHROPIC_API_KEY`
2. **Run:** `npm run dev` — app at http://localhost:3000
3. **Dump:** Paste text in Dump Bar → stored in `nexus.db` with embeddings
4. **Chat:** Ask questions → Navigation → Reasoning → Chat Agent streams response
5. **DB:** `nexus.db` and `lib/db.js` — delete DB and re-dump if changing embedding model/dimensions
6. **Knowledge storage:** All dumped content lives in `nexus.db` (SQLite). No text files. Raw text in `knowledge.raw_text`, embeddings in `knowledge.embedding`.
7. **Remember in chat:** Chat does NOT add to knowledge. Saying "remember X" in chat stores it only in that conversation's messages, not in the knowledge table. Use the Dump Bar to add knowledge.

---

## 1. Full File and Folder Structure (Every File, Every Folder, Exact Paths)

```
nexus/
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.js              # POST /api/chat — chat with streaming
│   │   ├── conversations/
│   │   │   ├── [id]/
│   │   │   │   ├── name/
│   │   │   │   │   └── route.js      # POST /api/conversations/[id]/name — generate title via Claude
│   │   │   │   └── route.js          # PATCH/DELETE /api/conversations/[id] — update or delete
│   │   │   ├── search/
│   │   │   │   └── route.js          # GET /api/conversations/search?q=... — FTS search
│   │   │   └── route.js              # GET/POST /api/conversations — list or create
│   │   ├── debug/
│   │   │   ├── knowledge/
│   │   │   │   └── route.js          # GET /api/debug/knowledge — verify DB contents (remove in production)
│   │   │   └── search/
│   │   │       └── route.js          # GET /api/debug/search?q=... — see what chunks retrieved for query
│   │   └── intake/
│   │       └── route.js              # POST /api/intake — dump text into knowledge
│   ├── globals.css                   # Tailwind directives
│   ├── layout.tsx                    # Root layout, metadata
│   └── page.tsx                      # Home page, renders NexusUI
├── components/
│   └── NexusUI.jsx                   # Two-panel layout: sidebar (Chats list) + main (Dump Bar + Chat Panel)
├── lib/
│   ├── chatAgent.js                  # NEXUS chat, streams Claude response
│   ├── db.js                         # SQLite + sqlite-vec init, knowledge + conversations schema
│   ├── embeddings.js                # Ollama nomic-embed-text (768 dims)
│   ├── intakeAgent.js                # Ingest raw text → Claude + embed + DB
│   ├── navigationAgent.js            # Query → embed → vector search
│   └── reasoningAgent.js            # Summarize + filter chunks + confidence
├── .env.local                        # ANTHROPIC_API_KEY (required), OPENAI_API_KEY (unused)
├── .eslintrc.json                    # ESLint config (extends next/core-web-vitals)
├── .gitignore
├── instrumentation.js                # Preloads db.js on Node server start
├── next-env.d.ts                     # Next.js TypeScript declarations (generated)
├── next.config.js
├── NEXUS_CONTEXT.md                  # This file
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── nexus.db                          # SQLite DB (created at runtime, project root)
```

**Excluded from structure:** `node_modules/`, `.next/` (build output)

---

## 2. Complete Database Schema

**File:** `lib/db.js`  
**Database path:** `path.join(process.cwd(), "nexus.db")`  
**Extension:** sqlite-vec loaded via `sqliteVec.load(db)` at initialization

**Table:** `knowledge` (created with `CREATE TABLE IF NOT EXISTS`)

**This schema never changes without explicit discussion.**

| Column          | Type  | Constraints                                                                 | What it stores |
|-----------------|-------|-----------------------------------------------------------------------------|----------------|
| id              | TEXT  | PRIMARY KEY                                                                | UUID v4, unique per record |
| module          | TEXT  | NOT NULL, CHECK(module IN ('people', 'projects', 'notes', 'external'))    | One of exactly four allowed values |
| entity_links    | TEXT  | NOT NULL                                                                   | JSON array of related record IDs, e.g. `[]` |
| tags            | TEXT  | NOT NULL                                                                   | JSON array of strings, e.g. `["tag1","tag2"]` |
| source          | TEXT  | NOT NULL                                                                   | Origin, typically `"user_dump"` |
| created_at      | TEXT  | NOT NULL                                                                   | ISO timestamp |
| updated_at      | TEXT  | NOT NULL                                                                   | ISO timestamp |
| embedding       | BLOB  | Nullable                                                                   | 768-dim Float32 vector (nomic-embed-text), stored as Buffer |
| raw_text        | TEXT  | NOT NULL                                                                   | Original text content |
| structured_data | TEXT  | NOT NULL                                                                   | JSON string — Claude's formatted/cleaned version |

**The four allowed module values:** `people`, `projects`, `notes`, `external` — enforced by CHECK constraint.

---

**Table:** `conversations` (created with `CREATE TABLE IF NOT EXISTS`)

| Column     | Type    | Constraints                         | What it stores                    |
|------------|---------|-------------------------------------|-----------------------------------|
| id         | INTEGER | PRIMARY KEY AUTOINCREMENT           | Auto-increment ID                 |
| name       | TEXT    | NOT NULL DEFAULT 'New Chat'         | Conversation title                |
| created_at | DATETIME| DEFAULT CURRENT_TIMESTAMP           | Creation timestamp                |
| updated_at | DATETIME| DEFAULT CURRENT_TIMESTAMP           | Last update timestamp             |
| messages   | TEXT    | NOT NULL DEFAULT '[]'               | JSON array of message objects     |

**FTS5 virtual table:** `conversations_fts` — indexes `name` and `messages` for full-text search. Uses `content=conversations`, `content_rowid=id`. Triggers (`conversations_ai`, `conversations_ad`, `conversations_au`) keep FTS in sync on INSERT, DELETE, UPDATE.

---

## 3. Every Agent (File, Function, Inputs, Outputs, Model, Prompts)

### lib/intakeAgent.js

**Exported function:** `runIntakeAgent`

**Input:** `rawText: string` — raw text string from user

**Output:** `string` — confirmation message:
- Single record: `"Stored as [module] — tagged [tags]"`
- Multiple: `"Split into N records — stored as [modules] tagged [tags]"`

**Model:** `claude-haiku-4-5-20251001`

**Baked-in system prompt (INTAKE_SYSTEM_PROMPT):**
```
You are a data intake assistant. Your job is to process raw text that a user has dumped into a knowledge system.

For each input, you must:
1. Decide which module the content belongs to. The only valid options are: people, projects, notes, or external.
2. Extract a list of relevant tags (keywords or categories that describe the content).
3. Create a clean, formatted version of the input as structured_data.

You must respond with ONLY a valid JSON object, no other text. The JSON must have exactly these fields:
- module: one of "people", "projects", "notes", "external"
- tags: an array of strings
- entity_links: an empty array []
- source: "user_dump"
- structured_data: a clean formatted version of the input (string or object). CRITICAL: Escape all quotes and newlines in strings. Use \" for quotes inside strings, \n for newlines. Prefer an object like {"content": "..."} for long text to avoid escaping issues.
```

**User message format:** `Process this raw text and return the required JSON:\n\n${rawText}`

**Additional behavior:** Uses `jsonrepair` when JSON.parse fails. Strips ` ```json ` and ` ``` ` from Claude response before parsing.

---

### lib/navigationAgent.js

**Exported function:** `runNavigationAgent`

**Input:** `query: string` — user search/question string

**Output:** `Array<Chunk>` — up to 5 chunks, each:
```javascript
{ id: string, module: string, tags: string[], raw_text: string, structured_data: any }
```

**Model:** None (no Claude). Uses Ollama via `getEmbedding(query)` for embeddings.

**Behavior:** Embeds query with Ollama, runs `SELECT ... FROM knowledge WHERE embedding IS NOT NULL ORDER BY vec_distance_cosine(embedding, ?) LIMIT 5`, parses tags and structured_data from JSON.

---

### lib/reasoningAgent.js

**Exported function:** `runReasoningAgent`

**Input:**
- `chunks: Array<Chunk>` — from Navigation Agent
- `conversationHistory: Array<{ role: string, content: string | any }>`

**Output:**
```javascript
{
  relevantChunks: Array<Chunk>,
  chatSummary: string,
  confidenceSignal: 'strong' | 'partial' | 'none'
}
```

**Model:** `claude-sonnet-4-6` (both calls)

**Baked-in prompts:**

SUMMARY_SYSTEM_PROMPT:
```
You are a conversation summarizer. Your job is to compress a chat conversation into a brief summary.

Summarize the conversation in 3 sentences or less. Capture only what is essential for answering the next question. Be concise and focus on: user intent, key topics discussed, and any constraints or context that matter for follow-up.
```

EVALUATION_SYSTEM_PROMPT:
```
You are a context evaluator for a knowledge retrieval system. Given a conversation summary and a set of retrieved knowledge chunks, you must evaluate which chunks actually fit what the user is asking about.

Return ONLY a valid JSON object with exactly these fields:
- relevantChunkIds: an array of chunk IDs (strings) that are actually relevant to the query. Exclude chunks that do not fit.
- confidenceSignal: one of "strong", "partial", or "none"
  - "strong": chunks clearly and directly answer the user's question
  - "partial": some chunks are relevant but incomplete or tangential
  - "none": no chunks meaningfully address what was asked
```

**Fallback:** If reasoning filters out all chunks but navigation returned some, pass all chunks instead of none (avoids over-filtering).

**Additional behavior:** Uses `jsonrepair` when JSON.parse fails on evaluation response.

---

### lib/chatAgent.js

**Exported function:** `runChatAgent`

**Input:**
- `userMessage: string` — current message
- `contextPackage: ContextPackage` — from Reasoning Agent (`{ relevantChunks, chatSummary, confidenceSignal }`)
- `conversationHistory: Array<Message>` — full message array

**Output:** `AsyncIterable<StreamEvent>` — Anthropic stream, events include `content_block_delta` with `delta.text`

**Model:** `claude-sonnet-4-6`

**Baked-in system prompt (NEXUS_SYSTEM_PROMPT):**
```
You are NEXUS, a personal intelligence system. Answer the user's question using the provided context chunks first. If the context is thin or confidence is 'none', use your own knowledge and clearly indicate you are doing so. Always be direct and specific.
```

**Context block format:** Chat summary, confidence signal, and relevant chunks (raw_text + structured_data) appended to system prompt.

**Additional behavior:** Normalizes messages — `content` can be string or `[{ type: "text", text }]`.

---

## 4. Every API Route (Path, Method, Request, Response)

### POST /api/intake

**Path:** `app/api/intake/route.js`

**Request body:**
```json
{ "rawText": "string" }
```

**Success (200):**
```json
{ "confirmation": "Stored as people — tagged contact, engineer" }
```

**Errors:**
- 400: `{ "error": "rawText is required" }`
- 500: `{ "error": "message" }` (includes agent/API errors)

**Pre-check:** Returns 500 if `ANTHROPIC_API_KEY` is missing.

**Flow:** `runIntakeAgent(rawText)` → JSON response.

---

### POST /api/chat

**Path:** `app/api/chat/route.js`

**Request body:**
```json
{
  "userMessage": "string",
  "conversationHistory": [{ "role": "user"|"assistant", "content": "string" }, ...]
}
```

**Success (200):** Streamed plain text (`Content-Type: text/plain; charset=utf-8`, `Transfer-Encoding: chunked`)

**Errors:**
- 400: `{ "error": "userMessage is required" }`
- 500: `{ "error": "message" }`

**Pre-check:** Returns 500 if `ANTHROPIC_API_KEY` is missing.

**Flow:** `runNavigationAgent(userMessage)` → `runReasoningAgent(chunks, conversationHistory)` → `runChatAgent(userMessage, contextPackage, conversationHistory)` → stream. On stream error mid-stream, appends `\n[Error: message]` and closes. On catch (e.g. Ollama down): returns 500 with error message and hint to run `ollama serve` and `ollama pull nomic-embed-text`.

---

### GET /api/debug/knowledge

**Path:** `app/api/debug/knowledge/route.js`

**Request:** No body. GET only.

**Success (200):**
```json
{
  "totalRows": 6,
  "rowsWithEmbedding": 6,
  "sample": [
    { "id": "...", "module": "people", "raw_preview": "...", "len": 132 }
  ]
}
```

**Purpose:** Verify dump content is in DB. Remove in production.

---

### GET /api/debug/search

**Path:** `app/api/debug/search/route.js`

**Request:** Query param `q` (default "Elon Musk"). Example: `GET /api/debug/search?q=Elon+Musk`

**Success (200):**
```json
{
  "query": "Elon Musk",
  "chunksRetrieved": 5,
  "chunks": [
    { "id": "...", "module": "people", "tags": [...], "raw_preview": "...", "len": 132 }
  ]
}
```

**Purpose:** See what chunks would be retrieved for a query. Remove in production.

---

### GET /api/conversations

**Path:** `app/api/conversations/route.js`

**Request:** No body. GET only.

**Success (200):**
```json
[
  { "id": 1, "name": "New Chat", "created_at": "...", "updated_at": "...", "messages": [...] }
]
```

**Flow:** All conversations ordered by `updated_at DESC`. `messages` parsed from JSON string to array.

---

### POST /api/conversations

**Path:** `app/api/conversations/route.js`

**Request:** No body. POST only.

**Success (200):**
```json
{ "id": 1, "name": "New Chat" }
```

**Flow:** Creates new conversation with default name `'New Chat'`, returns the new record's id and name.

---

### PATCH /api/conversations/[id]

**Path:** `app/api/conversations/[id]/route.js`

**Request body:**
```json
{ "messages": [...], "name": "optional" }
```

**Success (200):** Full conversation object with `id`, `name`, `created_at`, `updated_at`, `messages` (parsed array).

**Errors:**
- 400: `{ "error": "At least one of messages or name is required" }`
- 404: `{ "error": "Conversation not found" }`

**Flow:** Updates `messages` as JSON string, `updated_at` to CURRENT_TIMESTAMP. If `name` provided, updates that too.

---

### DELETE /api/conversations/[id]

**Path:** `app/api/conversations/[id]/route.js`

**Request:** No body. DELETE only.

**Success (200):**
```json
{ "ok": true }
```

**Errors:**
- 404: `{ "error": "Conversation not found" }`

**Flow:** Deletes the conversation record. FTS triggers remove it from `conversations_fts`.

---

### POST /api/conversations/[id]/name

**Path:** `app/api/conversations/[id]/name/route.js`

**Request body:**
```json
{ "firstMessage": "string" }
```

**Success (200):**
```json
{ "name": "Generated Title" }
```

**Errors:**
- 400: `{ "error": "firstMessage is required" }`
- 404: `{ "error": "Conversation not found" }`
- 500: `{ "error": "message" }` (includes ANTHROPIC_API_KEY missing)

**Pre-check:** Returns 500 if `ANTHROPIC_API_KEY` is missing.

**Flow:** Calls Claude Haiku with prompt: "Generate a conversation title from this message. Maximum 5 words. No punctuation. No quotes. Return only the title, nothing else: [firstMessage]". Saves returned title to conversation record and returns it.

---

### GET /api/conversations/search

**Path:** `app/api/conversations/search/route.js`

**Request:** Query param `q` (optional). Example: `GET /api/conversations/search?q=foo`

**Success (200):** Same as GET /api/conversations — array of conversation objects with `messages` parsed. If `q` is empty, returns all conversations ordered by `updated_at DESC`. Otherwise searches `conversations_fts` across `name` and `messages`, returns matching conversations ordered by `updated_at DESC`.

---

## 5. Full Pipelines (Step by Step)

### Intake Pipeline (Dump)

1. User pastes text in Dump Bar → `handleDump` in NexusUI.jsx
2. POST `/api/intake` with `{ rawText }`
3. API route validates `rawText`, imports `runIntakeAgent`
4. **runIntakeAgent:**
   - Count words. If &lt; 600: go to step 5a. If ≥ 600: go to step 4a.
   - **4a. splitIntoChunks:** Split on paragraph boundaries (double newline). Chunks 400–500 words, 75-word overlap. If paragraph &gt; 500 words, split on sentences. If sentence &gt; 500 words, split on words with overlap.
   - **4b.** For each chunk: go to step 5.
   - **5a (single):** processSingleChunk(rawText) → one result
   - **5b (multiple):** processSingleChunk(chunk) for each chunk → N results
5. **processSingleChunk (per chunk):**
   - Call Claude (Haiku) with INTAKE_SYSTEM_PROMPT, user message = raw text
   - Strip markdown fences, parse JSON (with jsonrepair fallback)
   - Call `getEmbedding(rawText)` via Ollama
   - INSERT into knowledge (id, module, entity_links, tags, source, created_at, updated_at, embedding, raw_text, structured_data)
   - Return { module, tags }
6. Build confirmation string: single → "Stored as X — tagged Y"; multiple → "Split into N records — stored as X tagged Y"
7. Return JSON `{ confirmation }` to frontend
8. Frontend displays confirmation, clears input

### Chat Pipeline

1. User types message, clicks Send → `handleChat` in NexusUI.jsx (or selects conversation from sidebar to load its history)
2. POST `/api/chat` with `{ userMessage, conversationHistory }`
3. API route validates `userMessage`, imports agents
4. **Navigation Agent:** `runNavigationAgent(userMessage)`
   - `getEmbedding(userMessage)` via Ollama
   - SELECT from knowledge ORDER BY vec_distance_cosine LIMIT 5
   - Return up to 5 chunks
5. **Reasoning Agent:** `runReasoningAgent(chunks, conversationHistory)`
   - Call Claude (Sonnet) to summarize conversation
   - Call Claude (Sonnet) to evaluate chunks, return relevantChunkIds and confidenceSignal
   - Filter chunks by relevantChunkIds; if empty, pass all chunks (fallback)
   - Return { relevantChunks, chatSummary, confidenceSignal }
6. **Chat Agent:** `runChatAgent(userMessage, contextPackage, conversationHistory)`
   - Build system prompt: NEXUS_SYSTEM_PROMPT + context block (summary, confidence, relevant chunks)
   - Append userMessage to conversation
   - Call Claude (Sonnet) with stream: true
   - Return stream
7. API route consumes stream, encodes text, returns ReadableStream
8. Frontend reads stream, displays incrementally, appends to messages on completion

### Frontend Layout (NexusUI)

**Two-panel layout:**
- **Left sidebar (250px):** "Chats" header, "New Chat" button, search input, scrollable conversation list. Each item shows conversation name and formatted `updated_at` (time if today, date otherwise). Active conversation highlighted with darker background.
- **Right main panel:** Dump Bar at top, Chat Panel below. Both unchanged in behavior.

**State:** `conversations`, `searchQuery`, `activeConversationId`, `conversationHistory` (message array `[{ role, content }]`), `editingConversationId`, `editingName` (for rename). `initialLoadDoneRef` prevents mount-effect race: only load first conversation once; when user sends, set ref so late mount fetch does not overwrite.

**New Chat button:** Sets `activeConversationId` to null, clears `conversationHistory`, resets chat panel to blank state.

**Search:** Input below "New Chat", above list. As user types, GET /api/conversations/search?q=[input] (300ms debounce) replaces sidebar list with results. When input cleared, GET /api/conversations reloads full list.

**On mount:** GET /api/conversations → populate sidebar → auto-load most recent (first in list) into `conversationHistory` and set `activeConversationId`.

**On sidebar click:** Fetch list (search or full based on `searchQuery`), find selected conversation, load its `messages` into `conversationHistory`, set `activeConversationId`. Chat panel renders full history in same bubble format as live messages.

**New conversation (activeConversationId is null):**
1. User sends message → POST /api/conversations → get id, set `activeConversationId`, clear search, refetch full list
2. Send message through chat pipeline as normal
3. After AI response completes → PATCH /api/conversations/[id] with full messages array
4. POST /api/conversations/[id]/name with first user message as `firstMessage` → update sidebar name in real time when returned

**Existing conversation (activeConversationId set):**
1. Send message through chat pipeline as normal
2. After each AI response → PATCH /api/conversations/[id] with full messages array

---

## 6. Tech Stack

- **Framework:** Next.js 14 (App Router), version 14.2.18
- **Database:** SQLite via `better-sqlite3`
- **Vector search:** `sqlite-vec` with 768 dimensions, loaded at initialization via `sqliteVec.load(db)`
- **Embeddings:** Ollama `nomic-embed-text` — fully local, no API key, replaces OpenAI entirely. POST to `http://localhost:11434/api/embeddings`
- **Claude models:**
  - Intake Agent: `claude-haiku-4-5-20251001`
  - Reasoning Agent: `claude-sonnet-4-6` (both summary and evaluation calls)
  - Chat Agent: `claude-sonnet-4-6`
- **Frontend:** React 18, Tailwind CSS
- **Other:** `uuid` for IDs, `jsonrepair` for malformed JSON from Claude

---

## 7. Pre-Processor (Chunking for Intake)

**File:** `lib/intakeAgent.js`, function `splitIntoChunks`

**Threshold:** 600 words. Inputs under 600 words are processed as one record.

**Chunk size:** 400–500 words per chunk (TARGET_CHUNK_WORDS = { min: 400, max: 500 })

**Overlap:** 75 words (OVERLAP_WORDS = 75)

**Splitting order:**
1. Split on paragraph boundaries (`\n\s*\n`)
2. If paragraph &gt; 500 words: split on sentence boundaries (`(?<=[.!?])\s+`)
3. If sentence &gt; 500 words: split on word boundaries with 75-word overlap

**Records created:** 1 if &lt; 600 words; otherwise N chunks (each becomes one knowledge row)

**Confirmation strings:**
- Single: `"Stored as [module] — tagged [tags]"`
- Multiple: `"Split into [N] records — stored as [modules] tagged [tags]"` (modules and tags are deduplicated)

---

## 8. Embeddings (lib/embeddings.js)

**Exported:** `getEmbedding(text: string) => Promise<Buffer>`, `EMBEDDING_DIMENSIONS` = 768

**Implementation:** POST to `http://localhost:11434/api/embeddings`, body `{ model: 'nomic-embed-text', prompt: text }`. Converts response array to Float32 Buffer.

**Requirements:** Ollama installed and running, `ollama pull nomic-embed-text`

---

## 9. Active Bugs or Issues Currently Being Debugged

**None.** All previously encountered bugs are resolved. Debug endpoints (`/api/debug/knowledge`, `/api/debug/search`) were added to diagnose a user report that chat "did not know" about dumped Elon Musk content. Investigation showed the content was in the DB and retrievable; a fallback was added to the Reasoning Agent so that when it filters out all chunks, all chunks are passed instead (avoids over-filtering). Debug endpoints remain for future troubleshooting; consider removing before production.

---

## 10. Decisions and Conventions

1. **Modules:** Only `people`, `projects`, `notes`, `external`. Enforced by CHECK. Schema never changes without explicit discussion.

2. **Chunking (intake):** 600-word threshold; 400–500 words/chunk; 75-word overlap; break on paragraphs → sentences → words.

3. **Embeddings:** Ollama nomic-embed-text, 768 dimensions. Stored as Float32 BLOB. No OpenAI for embeddings. OpenAI package kept in package.json for potential future use.

4. **Vector search:** sqlite-vec `vec_distance_cosine`, top 5, `WHERE embedding IS NOT NULL`.

5. **Dynamic imports in API routes:** Agents imported via `await import("@/lib/...")` to avoid loading db/sqlite-vec at build time.

6. **serverComponentsExternalPackages:** better-sqlite3, sqlite-vec, sqlite-vec-windows-x64 — required for native modules on Windows.

7. **instrumentation.js:** Preloads db when Node server starts (`NEXT_RUNTIME === "nodejs"`).

8. **Fetch URLs:** Use `window.location.origin + path` to avoid base-path issues.

9. **Error handling:** API routes return JSON `{ error }`; frontend uses `res.text()` first, skips JSON parse if body starts with `<` (HTML error page).

10. **Path alias:** `@/` → project root (tsconfig paths).

11. **Lib files:** CommonJS (`require`/`module.exports`); API routes: ESM (`import`/`export`).

12. **Claude JSON:** Strip markdown code fences before JSON.parse. Use jsonrepair on parse failure (intakeAgent, reasoningAgent).

13. **Conversation format:** `{ role: "user"|"assistant", content: string }`; chatAgent normalizes structured content to string.

14. **Embedding migration:** Switching embedding models requires deleting nexus.db and re-dumping; vec_distance_cosine needs matching dimensions.

15. **Claude model split:** Intake uses Haiku (lightweight classification/tagging). Reasoning and Chat use Sonnet for best reasoning quality.

16. **Dev server port:** Fixed at 3000 via `npm run dev` script (`next dev -p 3000`).

17. **Rejected:** OpenAI embeddings — 403 project access. Replaced with Ollama.

18. **Rejected:** Per-route body size or timeout config — not added; large dumps may hit limits.

---

## 11. Current Build Status of Every Component

| Component | Status |
|-----------|--------|
| **Left Sidebar** | Working. 250px fixed, "Chats" header, "New Chat" button, search input (300ms debounce), scrollable conversation list (name + formatted updated_at), active highlighted. Each item has rename (✎) and delete (✕) buttons. |
| **Delete chat** | Working. ✕ button on each conversation, confirms, DELETE /api/conversations/[id], refreshes list. If deleted conversation was active, switches to New Chat. |
| **Rename chat** | Working. ✎ button opens inline edit, PATCH with new name on Save/Enter/blur, Cancel/Escape to abort. |
| **Right Main Panel** | Working. Dump Bar + Chat Panel. |
| **Dump Bar** | Working. Single-line input, Dump button, POST /api/intake, shows confirmation or error. |
| **Chat Panel** | Working. Messages area (flex, min 360px), input, Send button, POST /api/chat, streams response. Renders loaded conversation history in same bubble format. |
| **New Chat** | Working. Clears active conversation and history, resets to blank state. |
| **New conversation creation** | Working. On first message when no active conversation: POST /api/conversations, set id, send through chat, PATCH after response, auto-name via Claude Haiku, update sidebar in real time. |
| **PATCH after response** | Working. After every AI response (new or existing), PATCH /api/conversations/[id] with full messages array. |
| **Search** | Working. GET /api/conversations/search?q=... as user types (debounced). Clear input → full list. |
| **Conversation loading** | Working. On mount: GET /api/conversations, auto-load most recent. On sidebar click: fetch list (search or full), load selected conversation's messages into chat. |
| **Intake API** | Working. Validates rawText, runs intakeAgent, returns JSON. |
| **Chat API** | Working. Runs Navigation → Reasoning → Chat, streams response. |
| **Intake Agent** | Working. Chunking, Claude Haiku, Ollama embed, DB insert, jsonrepair fallback. |
| **Navigation Agent** | Working. Ollama embed, vector search, returns top 5 chunks. |
| **Reasoning Agent** | Working. Summary + evaluation via Claude Sonnet, jsonrepair fallback, pass-all fallback when filtered empty. |
| **Chat Agent** | Working. Builds context, streams Claude Sonnet response. |
| **Database** | Working. SQLite + sqlite-vec, knowledge table, 768-dim embeddings. |
| **Embeddings** | Working. Ollama nomic-embed-text, 768 dims. |
| **Debug /api/debug/knowledge** | Working. Returns row count and sample. |
| **Debug /api/debug/search** | Working. Returns chunks for a query. |
| **GET/POST /api/conversations** | Working. List all or create new conversation. |
| **PATCH /api/conversations/[id]** | Working. Update messages and/or name. |
| **DELETE /api/conversations/[id]** | Working. Delete conversation. |
| **POST /api/conversations/[id]/name** | Working. Generate title via Claude Haiku. |
| **GET /api/conversations/search** | Working. FTS search across name and messages. |
| **Frontend error handling** | Working. 404 message, JSON parse guard for HTML, stream error append. |
| **Build** | Working. `npm run build` succeeds. |
| **Lint** | Working. `npm run lint` passes. |

**Not built:** No authentication, no file upload for dump, no maxDuration or body size limits on API routes, no production deployment config, no "remember in chat" (chat cannot add to knowledge base).

---

## 12. Troubleshooting

**"Cannot find module './XXX.js'" or page 500:** Corrupted `.next` cache. Fix: Stop dev server, delete `.next` folder (`Remove-Item -Recurse -Force .next`), restart `npm run dev`. If port 3000 is in use, kill the process first.

**"Chat failed" or Ollama errors:** Ensure Ollama is running (`ollama serve`), model pulled (`ollama pull nomic-embed-text`). Chat API returns hints for connection-refused errors.

---

## 13. Configuration Files (Exact Contents)

**next.config.js:**
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "better-sqlite3",
      "sqlite-vec",
      "sqlite-vec-windows-x64",
    ],
  },
};
module.exports = nextConfig;
```

**instrumentation.js:**
```javascript
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/db.js");
  }
}
```

**package.json scripts:** `"dev": "next dev -p 3000"`, `"build": "next build"`, `"start": "next start"`, `"lint": "next lint"`

**tsconfig.json paths:** `"@/*": ["./*"]`

---

## 14. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| ANTHROPIC_API_KEY | Yes | Claude API (all agents) |
| OPENAI_API_KEY | No | Unused; kept for potential future use |

**Ollama:** No env var. Must run locally at localhost:11434 with `nomic-embed-text` pulled.

---

## 15. Dependencies (package.json)

**Runtime:** @anthropic-ai/sdk, better-sqlite3, jsonrepair, next 14.2.18, openai (unused), react, react-dom, sqlite-vec, uuid

**Optional:** sqlite-vec-windows-x64 (native extension for Windows)

**Dev:** @types/better-sqlite3, @types/node, @types/react, @types/react-dom, @types/uuid, eslint, eslint-config-next, postcss, tailwindcss, typescript
