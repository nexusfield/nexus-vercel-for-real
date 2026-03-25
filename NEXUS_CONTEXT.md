# NEXUS — Complete Project Context

**Purpose:** This file is the single source of truth for restoring full context in a new conversation. It documents the entire project state exhaustively. Paste this file into every new Claude session to restore full context. Do not summarize or skip anything when using it.

---

## Quick Start (New Context Window)

1. **Prerequisites:** Node.js, Supabase project with `pgvector` migration applied, `.env.local` with `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (see `.env.example`)
2. **Run:** `npm run dev` — app at http://localhost:3000. Unauthenticated users are redirected to `/login`; sign in with Google to access the app.
3. **Dump:** Go to Knowledge tab, paste text in Dump Bar → stored in Supabase Postgres (`knowledge` table) with pgvector embeddings
4. **Chat:** Ask questions → Navigation → Chat Agent streams response
5. **DB:** Supabase/Postgres via `lib/supabase.js` client and `lib/db.js` adapter. Apply all migrations in `supabase/migrations/` in order (`001`–`005`) before using app features (production has all five applied; see **Deployment**).
6. **Knowledge storage:** All dumped content lives in Supabase (`knowledge` table). Raw text in `knowledge.raw_text`, embeddings in `knowledge.embedding` (`vector(768)`).
7. **Remember in chat:** Chat does NOT add to knowledge. Saying "remember X" in chat stores it only in that conversation's messages, not in the knowledge table. Use the Dump Bar (Knowledge tab) to add knowledge.
8. **Modes:** Create modes in the Modes tab (name, optional trigger phrase, instruction). Activate a mode to prepend its instruction to the system prompt for that chat session. Active mode resets when switching conversations or refreshing.
9. **Mobile:** Sidebar is collapsible (hamburger to open, overlay/✕ to close). When the sidebar is closed (≤768px), it uses `pointer-events: none` so off-canvas chrome does not intercept taps on the main panel (keyboard/focus). Dump bar and chat input are touch-friendly (48px min height, font-size 16px to reduce iOS zoom). Main tab row scrolls horizontally on narrow screens (`.nexus-tab-strip-scroll`). Main content uses full width when sidebar is closed.
10. **Folders:** Chats tab sidebar supports folders for organizing threads. Create folders, expand/collapse, rename/delete via "..." menu. Right-click or "..." on any thread to move it to a folder. Deleting a folder ungroups its threads (no threads deleted).
11. **Journal (local-only):** Journal tab is isolated from chat/knowledge/agents. Data is stored in IndexedDB only via `lib/journalDb.js` (no Supabase, no API calls). Supports nested notes/folders, markdown editing with syntax highlighting, autosave (~400ms), search, context-menu CRUD, and drag/drop moves (note->folder, folder->folder).

---

## Cross-Platform Requirement (Critical)

**Every feature change (UI or backend) must be treated as multi-platform by default.**

Nexus runs in at least three materially different runtimes:

1. Desktop/laptop web browser
2. Mobile browser tab (Safari/Chrome)
3. Installed mobile PWA (`display-mode: standalone`, especially iOS WKWebView)

### Non-negotiable process

- Do **not** assume behavior parity across these runtimes.
- Any feature work is incomplete until validated against all relevant runtimes.
- Prefer isolated overrides instead of shared global hacks:
  - Keep baseline behavior in shared web rules.
  - Scope platform-specific behavior with explicit media/runtime boundaries (for example standalone + mobile).
- Preserve a single layout contract:
  - clearly define which container owns scrolling,
  - avoid overlapping scroll/sticky/fixed ownership,
  - avoid mixing body-level viewport tricks unless absolutely necessary.

### Required verification checklist for UI-impacting changes

- Desktop web: layout stability, scroll ownership, input/focus behavior
- Mobile browser tab: same checks + keyboard interaction
- Installed PWA: same checks + safe-area and hit-testing behavior

If one target is broken while another is fixed, the change is not complete and must not be treated as done.

---

## Deployment

**Production (Vercel)**

- **Live app:** https://nexus-vercel-for-real.vercel.app
- **Source repository:** https://github.com/nexusfield/nexus-vercel-for-real

**Supabase**

- All **five** migrations have been applied to the production database **in order:** `001_init.sql`, `002_add_folders.sql`, `003_knowledge_folders.sql`, `004_knowledge_folders_rls.sql`, `005_user_profile.sql`.

**Vercel environment variables**

Set in the Vercel project (Production): `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXTAUTH_URL`.

**NEXTAUTH_URL**

- Explicitly set to **https://nexus-vercel-for-real.vercel.app** so NextAuth does **not** use each deployment’s dynamic host (e.g. preview `*.vercel.app` URLs) as the OAuth callback base. That mismatch against Google’s registered redirect URIs caused **`redirect_uri_mismatch`** during testing; pinning **`NEXTAUTH_URL`** to the canonical production URL is the fix.

**Google OAuth (Google Cloud Console)**

- **Authorized redirect URI (production):** https://nexus-vercel-for-real.vercel.app/api/auth/callback/google
- **OAuth consent screen:** **Testing** mode; test user **Lboykin2005@gmail.com** is added so that account can sign in while the app is not in production publishing status.

**Operational gotcha**

- **Vercel preview deployments** get **unique URLs** per deployment. Google OAuth only accepts **pre-registered** redirect URIs. If NextAuth derives the site URL from the **current** Vercel host (e.g. `VERCEL_URL` on a preview), Google returns **`redirect_uri_mismatch`**. **Mitigation:** set **`NEXTAUTH_URL`** to the **stable production URL** above; register **localhost** and **production** callback URIs separately for local vs prod (see §14).

---

## 1. Full File and Folder Structure (Every File, Every Folder, Exact Paths)

```
nexus/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts          # NextAuth handlers (GET, POST) — Google OAuth
│   │   ├── chat/
│   │   │   └── route.js              # POST /api/chat — chat with streaming
│   │   ├── modes/
│   │   │   ├── [id]/
│   │   │   │   └── route.js          # PATCH/DELETE /api/modes/[id] — update or delete mode
│   │   │   └── route.js              # GET/POST /api/modes — list or create
│   │   ├── conversations/
│   │   │   ├── [id]/
│   │   │   │   ├── name/
│   │   │   │   │   └── route.js      # POST /api/conversations/[id]/name — generate title via Claude
│   │   │   │   └── route.js          # PATCH/DELETE /api/conversations/[id] — update or delete
│   │   │   ├── search/
│   │   │   │   └── route.js          # GET /api/conversations/search?q=... — FTS search
│   │   │   └── route.js              # GET/POST /api/conversations — list or create
│   │   ├── folders/
│   │   │   ├── [id]/
│   │   │   │   └── route.js          # PATCH/DELETE /api/folders/[id] — rename or delete folder
│   │   │   └── route.js              # GET/POST /api/folders — list or create
│   │   ├── debug/
│   │   │   ├── knowledge/
│   │   │   │   └── route.js          # GET /api/debug/knowledge — verify DB contents (remove in production)
│   │   │   └── search/
│   │   │       └── route.js          # GET /api/debug/search?q=... — see what chunks retrieved for query
│   │   ├── intake/
│   │   │   └── route.js              # POST /api/intake — dump text into knowledge
│   │   └── knowledge/
│   │       ├── [id]/
│   │       │   └── route.js          # DELETE /api/knowledge/[id] — delete record
│   │       ├── link/
│   │       │   └── route.js          # POST /api/knowledge/link — link records
│   │       └── route.js             # GET /api/knowledge — list all records (id, raw_text, structured_data, module, tags, created_at)
│   ├── globals.css                   # Tailwind directives + mobile overrides (@media max-width 768px)
│   ├── layout.tsx                    # Root layout, metadata
│   ├── login/
│   │   └── page.tsx                  # Sign-in page — "Sign in with Google" link
│   └── page.tsx                      # Home page, renders NexusUI
├── components/
│   ├── JournalTab.jsx                # Journal tab UI (local IndexedDB tree + markdown editor)
│   └── NexusUI.jsx                   # Two-panel layout: sidebar (Chats list) + main (tab bar + tab content; Dump Bar only in Knowledge tab)
├── lib/
│   ├── backup.js                     # Legacy SQLite backup helper (not used by Supabase persistence)
│   ├── chatAgent.js                  # NEXUS chat, streams Claude response
│   ├── db.js                         # Supabase-backed DB adapter (prepare/all/get/run compatibility layer)
│   ├── embeddings.js                # Gemini embeddings (gemini-embedding-001, 768 dims)
│   ├── intakeAgent.js                # Ingest raw text → Claude + embed + DB
│   ├── journalDb.js                  # Journal IndexedDB helper (entries store + parentId/updatedAt indexes)
│   ├── navigationAgent.js            # Query → embed → vector search
│   ├── supabase.js                   # Runtime Supabase client getter (CJS)
│   ├── supabase.ts                   # Supabase client (TS export)
│   └── vector.js                     # Embedding Buffer -> pgvector literal helper
├── .env.example                      # Template for required env vars (copy to .env.local)
├── DEPLOYMENT.md                     # Vercel deployment guide + env vars + DB persistence notes
├── .env.local                        # Secrets (gitignored): ANTHROPIC_API_KEY, AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
├── .eslintrc.json                    # ESLint config (extends next/core-web-vitals)
├── .gitignore
├── auth.ts                           # NextAuth config — Google provider, authorized callback, dynamic NEXTAUTH_URL
├── instrumentation.js                # Preloads db.js, starts periodic backup helper
├── middleware.ts                     # Protects all routes except /login and /api/auth/*
├── next-env.d.ts                     # Next.js TypeScript declarations (generated)
├── next.config.js
├── NEXUS_CONTEXT.md                  # This file
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── supabase/
│   └── migrations/
│       ├── 001_init.sql              # Postgres + pgvector schema migration (knowledge/conversations/modes + vector search funcs)
│       └── 002_add_folders.sql       # folders table + folder_id on conversations
└── tsconfig.json
```

**Excluded from structure:** `node_modules/`, `.next/` (build output)

---

## 2. Complete Database Schema

**Runtime DB adapter:** `lib/db.js` (Supabase-backed compatibility adapter)  
**Client files:** `lib/supabase.js`, `lib/supabase.ts`  
**Schema migration:** `supabase/migrations/001_init.sql`  
**Vector extension:** `pgvector` via `CREATE EXTENSION IF NOT EXISTS vector`

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
| embedding       | vector(768) | Nullable                                                             | 768-dim vector (gemini-embedding-001) in pgvector |
| raw_text        | TEXT  | NOT NULL                                                                   | Original text content |
| structured_data | TEXT  | NOT NULL                                                                   | JSON string — Claude's formatted/cleaned version |

**The four allowed module values:** `people`, `projects`, `notes`, `external` — enforced by CHECK constraint.

---

**Table:** `conversations` (created with `CREATE TABLE IF NOT EXISTS`)

| Column     | Type    | Constraints                         | What it stores                    |
|------------|---------|-------------------------------------|-----------------------------------|
| id         | INTEGER | GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY | Auto-increment ID       |
| name       | TEXT    | NOT NULL DEFAULT 'New Chat'         | Conversation title                |
| created_at | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP       | Creation timestamp                |
| updated_at | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP       | Last update timestamp             |
| messages   | TEXT    | NOT NULL DEFAULT '[]'               | JSON array of message objects     |
| folder_id  | INTEGER | Nullable, FK to folders(id) ON DELETE SET NULL | Optional folder grouping   |

**Conversation search index:** `conversations_fts_idx` — PostgreSQL GIN index on `to_tsvector('english', coalesce(name,'') || ' ' || coalesce(messages,''))`.

---

**Table:** `folders` (created with `CREATE TABLE IF NOT EXISTS`)

| Column     | Type    | Constraints                         | What it stores                    |
|------------|---------|-------------------------------------|-----------------------------------|
| id         | INTEGER | GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY | Auto-increment ID       |
| name       | TEXT    | NOT NULL                            | Folder name                       |
| created_at | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP       | Creation timestamp                |
| user_id    | TEXT    | Nullable                            | Reserved for future multi-user   |

---

**Table:** `modes` (created with `CREATE TABLE IF NOT EXISTS`)

| Column         | Type    | Constraints                  | What it stores                    |
|----------------|---------|------------------------------|-----------------------------------|
| id             | INTEGER | GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY | Auto-increment ID      |
| name           | TEXT    | NOT NULL                     | Mode name                         |
| trigger_phrase | TEXT    | (nullable)                   | Optional trigger phrase           |
| instruction    | TEXT    | NOT NULL                     | Text prepended to system prompt   |
| created_at     | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | Creation timestamp              |

---

**Vector index:** `knowledge_embedding_ivfflat_idx` on `knowledge.embedding` using `ivfflat (vector_cosine_ops)`.

**Vector search SQL functions (migration-defined):**
- `search_knowledge_by_embedding(query_embedding vector(768), match_count integer default 5)` (runtime navigation explicitly passes `match_count: 15`)
- `find_most_similar_knowledge(query_embedding vector(768))`

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

**Output:** `Array<Chunk>` — up to 15 chunks, each:
```javascript
{ id: string, module: string, tags: string[], raw_text: string, structured_data: any }
```

**Model:** None (no Claude). Uses Gemini embeddings via `getEmbedding(query)`.

**Behavior:** Embeds query with Gemini (`gemini-embedding-001`), then `lib/db.js` maps the compatibility SQL call to Supabase RPC `search_knowledge_by_embedding(...)` backed by pgvector cosine distance (`embedding <=> query_embedding`). Returns top 15 chunks and parses tags/structured_data JSON.

---

### lib/chatAgent.js

**Exported function:** `runChatAgent`

**Input:**
- `userMessage: string` — current message
- `retrievedChunks: Array<Chunk>` — candidate chunks from Navigation Agent
- `conversationHistory: Array<Message>` — full message array
- `model` (optional) — defaults to `claude-sonnet-4-6`; supports Claude and Gemini models
- `geminiApiKey` (optional) — for Gemini models
- `activeModeInstruction` (optional) — if provided and non-empty, prepended to system prompt

**Output:** `AsyncIterable<StreamEvent>` — Anthropic/Gemini stream, events include text chunks

**Model:** `claude-sonnet-4-6` default; supports `claude-haiku-4-5-20251001`, `claude-opus-4-6`, `gemini-2.0-flash`, `gemini-2.0-pro` (from model selector)

**Baked-in system prompt (NEXUS_SYSTEM_PROMPT):**
```
You are NEXUS, a personal intelligence system. Use retrieved chunks as candidate context, internally decide relevance and confidence (strong/partial/none), answer from relevant chunks first, and if confidence is none state that retrieved context is insufficient and use your own knowledge.
```

**System prompt construction:** If `activeModeInstruction` is provided and non-empty, the final system prompt is: `[activeModeInstruction]\n\n---\n\n[NEXUS_SYSTEM_PROMPT]\n\n[contextBlock]`. Otherwise, it is `[NEXUS_SYSTEM_PROMPT]\n\n[contextBlock]` (unchanged from default).

**Context block format:** Retrieved candidate chunks (raw_text + structured_data) appended to system prompt.

**Additional behavior:** Normalizes messages — `content` can be string or `[{ type: "text", text }]`.

---

## 4. Every API Route (Path, Method, Request, Response)

### GET/POST /api/auth/[...nextauth]

**Path:** `app/api/auth/[...nextauth]/route.ts`

**Request:** Handled by NextAuth.js. GET/POST for sign-in, sign-out, callback, session, etc.

**Flow:** Exports `handlers` from `auth.ts`. Google OAuth provider. Sign-in page at `/login`. Callback redirects to `/` after successful auth.

---

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

### POST /api/intake/context-question

**Path:** `app/api/intake/context-question/route.js`

**Request body:**
```json
{ "rawText": "string" }
```

**Success (200):**
```json
{ "question": "string" }
```

**Errors:**
- 400: `{ "error": "rawText is required" }`
- 500: `{ "error": "message" }`

**Flow:** Claude Haiku analyzes the text and returns one content-specific question to improve storage and retrieval. Used by the dump bar and chat save flows before intake.

**Context question prompt (Haiku):** Instructs the model to identify content type (personal belief, project update, relationship note, historical writing, current thinking, research, idea, reflection), then ask the one question whose answer would most change how the content should be understood in the future. Provides examples by content type (e.g., for old writing — when it was written and whether it still reflects current thinking; for project update — current status and main blocker; for person/relationship note — most important thing to remember). Explicitly forbids generic questions like "what is this about" or "can you provide more context." The question must be specific to what is actually in the text.

---

### POST /api/chat

**Path:** `app/api/chat/route.js`

**Request body:**
```json
{
  "userMessage": "string",
  "conversationHistory": [{ "role": "user"|"assistant", "content": "string" }, ...],
  "model": "string (optional, default claude-sonnet-4-6)",
  "activeModeInstruction": "string (optional)"
}
```

**Success (200):** Streamed plain text (`Content-Type: text/plain`). When the user asks to dump/save, the chat agent may include `[SAVE_TO_KNOWLEDGE]` in the stream; the frontend parses this and triggers the dump flow.

**Errors:**
- 400: `{ "error": "userMessage is required" }`
- 500: `{ "error": "message" }`

**Pre-check:** Returns 500 if `ANTHROPIC_API_KEY` missing (or `GEMINI_API_KEY` for Gemini models).

**Save-from-chat:** When the user asks in natural language to dump, save, or add the conversation to the knowledge base (e.g. "dump this", "save this", "can we dump this into the server", "add this to knowledge"), the chat agent recognizes the intent and streams a response containing `[SAVE_TO_KNOWLEDGE]` followed by synthesis and a context question (format: `synthesis\n---\nquestion`). The frontend detects this in the stream, parses it, and shows the ConfirmationPanel (same flow as the dump bar). User answers, similarity check runs, then intake. No backend intercept — the AI handles it conversationally.

**Normal flow:** `runNavigationAgent(userMessage)` → `runChatAgent(userMessage, chunks, conversationHistory, model, geminiKey, activeModeInstruction)` → stream. Relevance filtering and confidence assessment are handled inside the chat agent prompt at generation time (no standalone reasoning call). On stream error mid-stream, appends `\n[Error: message]` and closes. On catch (e.g. Gemini embedding/key errors): returns 500 with the embedding error message and a hint to verify `GEMINI_API_KEY` and Gemini project access.

---

### GET /api/folders

**Path:** `app/api/folders/route.js`

**Request:** No body. GET only.

**Success (200):** Array of folder objects: `[{ id, name, created_at }, ...]` ordered by `created_at ASC`.

---

### POST /api/folders

**Path:** `app/api/folders/route.js`

**Request body:** `{ "name": "string" }`

**Success (200):** Created folder object `{ id, name, created_at }`.

**Errors:** 400 if `name` missing or empty.

---

### PATCH /api/folders/[id]

**Path:** `app/api/folders/[id]/route.js`

**Request body:** `{ "name": "string" }`

**Success (200):** Updated folder object.

**Errors:** 400 if name missing/empty; 404 if folder not found.

---

### DELETE /api/folders/[id]

**Path:** `app/api/folders/[id]/route.js`

**Request:** No body. DELETE only.

**Success (200):** `{ "ok": true }`

**Flow:** Sets `folder_id` to null on all conversations in that folder, then deletes the folder. No threads are deleted.

**Errors:** 404 if folder not found.

---

### GET /api/modes

**Path:** `app/api/modes/route.js`

**Request:** No body. GET only.

**Success (200):** Array of mode objects: `[{ id, name, trigger_phrase, instruction, created_at }, ...]` ordered by `created_at DESC`.

---

### POST /api/modes

**Path:** `app/api/modes/route.js`

**Request body:** `{ "name": "string", "trigger_phrase": "string (optional)", "instruction": "string" }`

**Success (200):** Created mode object.

**Errors:** 400 if `name` or `instruction` missing.

---

### PATCH /api/modes/[id]

**Path:** `app/api/modes/[id]/route.js`

**Request body:** `{ "name"?: "string", "trigger_phrase"?: "string", "instruction"?: "string" }` — at least one required.

**Success (200):** Updated mode object.

**Errors:** 400 if no fields provided; 404 if mode not found.

---

### DELETE /api/modes/[id]

**Path:** `app/api/modes/[id]/route.js`

**Request:** No body. DELETE only.

**Success (200):** `{ "ok": true }`

**Errors:** 404 if mode not found.

---

### GET /api/knowledge

**Path:** `app/api/knowledge/route.js`

**Request:** No body. GET only.

**Success (200):** Array of knowledge records:
```json
[
  {
    "id": "uuid",
    "raw_text": "original chunk text",
    "structured_data": { "content": "..." } | "...",
    "module": "people" | "projects" | "notes" | "external",
    "tags": ["tag1", "tag2"],
    "created_at": "ISO timestamp"
  }
]
```

**Flow:** SELECT id, raw_text, structured_data, module, tags, created_at FROM knowledge ORDER BY created_at DESC. Parses structured_data and tags from JSON. Returns full records for Knowledge tab display. `raw_text` is included so the frontend can fall back to it when structured_data has no content/summary/text.

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
  "chunksRetrieved": 15,
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
  { "id": 1, "name": "New Chat", "created_at": "...", "updated_at": "...", "messages": [...], "folder_id": null }
]
```

**Flow:** All conversations ordered by `updated_at DESC`. `messages` parsed from JSON string to array. `folder_id` included (null if ungrouped).

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
{ "messages": [...], "name": "optional", "folder_id": null | integer }
```

**Success (200):** Full conversation object with `id`, `name`, `created_at`, `updated_at`, `messages` (parsed array), `folder_id`.

**Errors:**
- 400: `{ "error": "At least one of messages, name, or folder_id is required" }`
- 404: `{ "error": "Conversation not found" }`

**Flow:** Updates `messages` as JSON string, `updated_at` to CURRENT_TIMESTAMP. If `name` provided, updates that too. If `folder_id` provided (integer or null), updates folder assignment.

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

1. User goes to Knowledge tab, pastes text in Dump Bar → `handleDump` in NexusUI.jsx
2. POST `/api/intake/context-question` with `{ rawText }` → Haiku returns one content-specific question
3. ConfirmationPanel shows question; user answers and clicks Save or Skip
4. If Save: prepend answer to rawText. Run similarity check. If similar record found, show Replace/Add alongside/Keep both. Otherwise or on Skip: proceed to intake.
5. POST `/api/intake` with `{ rawText }` (augmented if user answered)
6. API route validates `rawText`, imports `runIntakeAgent`
7. **runIntakeAgent:**
   - Count words. If &lt; 600: go to step 8a. If ≥ 600: go to step 7a.
   - **7a. splitIntoChunks:** Split on paragraph boundaries (double newline). Chunks 400–500 words, 75-word overlap. If paragraph &gt; 500 words, split on sentences. If sentence &gt; 500 words, split on words with overlap.
   - **7b.** For each chunk: go to step 8.
   - **8a (single):** processSingleChunk(rawText) → one result
   - **8b (multiple):** processSingleChunk(chunk) for each chunk → N results
8. **processSingleChunk (per chunk):**
   - Call Claude (Haiku) with INTAKE_SYSTEM_PROMPT, user message = raw text
   - Strip markdown fences, parse JSON (with jsonrepair fallback)
   - Call `getEmbedding(rawText)` via Gemini
   - INSERT into knowledge (id, module, entity_links, tags, source, created_at, updated_at, embedding, raw_text, structured_data)
   - Return { module, tags }
9. Build confirmation string: single → "Stored as X — tagged Y"; multiple → "Split into N records — stored as X tagged Y"
10. Return JSON `{ confirmation }` to frontend
11. Frontend displays confirmation, clears input

### Chat Pipeline

1. User types message, clicks Send → `handleChat` in NexusUI.jsx (or selects conversation from sidebar to load its history)
2. POST `/api/chat` with `{ userMessage, conversationHistory, model, activeModeInstruction? }` — `activeModeInstruction` included when an active mode is set
3. **Save-from-chat:** When the user asks to dump/save the conversation (e.g. "dump this", "can we dump this into the server"), the chat agent outputs `[SAVE_TO_KNOWLEDGE]` followed by synthesis and a context question. Frontend detects this in the stream, parses it, shows ConfirmationPanel; user answers, similarity check runs, then intake. Same flow as dump bar. Confirmation appended as assistant message.
4. API route validates `userMessage`, imports agents
5. **Navigation Agent:** `runNavigationAgent(userMessage)`
   - `getEmbedding(userMessage)` via Gemini
   - `lib/db.js` routes vector lookup to Supabase pgvector cosine search via RPC (`<=>`)
   - Return up to 15 chunks
6. **Chat Agent:** `runChatAgent(userMessage, chunks, conversationHistory, model, geminiKey, activeModeInstruction)`
   - Build system prompt: if `activeModeInstruction` provided, prepend it with `---` separator above NEXUS_SYSTEM_PROMPT; else NEXUS_SYSTEM_PROMPT + context block (retrieved chunks)
   - In-prompt behavior: internally determine relevant chunks and confidence (`strong|partial|none`) while generating the answer
   - Append userMessage to conversation
   - Call Claude (Sonnet) with stream: true
   - Return stream
7. API route consumes stream, encodes text, returns ReadableStream
8. Frontend reads stream, displays incrementally, appends to messages on completion

### Frontend Layout (NexusUI)

**Two-panel layout:**
- **Left sidebar (250px):** "Chats" header, "New Chat" button, search input, scrollable list. **Folders** at top: "New Folder" button, then folders (each with ▼/▶ expand toggle, name, "..." menu for Rename/Delete). Expanded folders show their threads indented beneath. Divider separates folders from ungrouped threads. Ungrouped threads render below. Each thread shows name and `updated_at`; ✎ rename, ⋮ menu (Move to folder), ✕ delete. Right-click or ⋮ on a thread opens "Move to folder" submenu. Active conversation highlighted. On mobile (≤768px): collapsible — hidden by default, slides in as overlay when hamburger tapped; ✕ button in header and overlay tap close it; auto-closes when conversation selected or New Chat clicked.
- **Right main panel:** Hamburger button (mobile only, top-left) to open sidebar. Tab bar (Chat, Knowledge, Modes, Profile, Journal) scrolls horizontally on small viewports; then active tab content. Chat tab: messages area (`flex` + `min-height: 0`, no fixed min height on the scroll region), model selector, active mode indicator (when a mode is active), chat input (`readOnly` while streaming or chat-save flow so the field can still take focus on mobile; Send stays disabled), Send button. Say "dump this" or "save this" to save the conversation to knowledge. Knowledge tab: Dump Bar at top, filter buttons, then knowledge records list (dump at top, browse below). Modes tab: no dump bar. Journal tab: local-only markdown notes with nested folder tree and autosave.

**State:** `conversations`, `searchQuery`, `activeConversationId`, `conversationHistory` (message array `[{ role, content }]`), `editingConversationId`, `editingName` (for rename), `mainPanelMode` ("chat"|"knowledge"|"modes"|"profile"|"journal"), `activeMode` (mode object or null — React state only, resets on conversation switch or page refresh, never stored in DB or conversation history), `sidebarOpen` (boolean — mobile only, controls sidebar visibility; closed by default on mobile), `chatModel` (persisted in localStorage). `folders`, `expandedFolders` (Set of folder ids), `editingFolderId`, `editingFolderName`, `folderMenuOpenId`, `threadMenuOpenId` (for ⋮ menus). `initialLoadDoneRef` prevents mount-effect race: only load first conversation once; when user sends, set ref so late mount fetch does not overwrite. Journal tab state is isolated in `components/JournalTab.jsx` (`entries`, `expandedFolderIds`, `selectedNoteId`, `searchQuery`, context menus, rename modal, drag/drop state).

**New Chat button:** Sets `activeConversationId` to null, clears `conversationHistory`, resets `activeMode` to null, resets `sidebarOpen` to false (closes sidebar on mobile), resets chat panel to blank state.

**Search:** Input below "New Chat", above list. As user types, GET /api/conversations/search?q=[input] (300ms debounce) replaces sidebar list with results. When input cleared, GET /api/conversations reloads full list.

**On mount:** GET /api/conversations → populate sidebar → auto-load most recent (first in list) into `conversationHistory` and set `activeConversationId`.

**On sidebar click:** Fetch list (search or full based on `searchQuery`), find selected conversation, load its `messages` into `conversationHistory`, set `activeConversationId`, reset `activeMode` to null, set `sidebarOpen` to false (closes sidebar on mobile). Chat panel renders full history in same bubble format as live messages.

**Mobile layout (≤768px):** Sidebar hidden by default (off-screen). Hamburger button in main header opens it; sidebar slides in as overlay. Closed sidebar uses `pointer-events: none` so taps reach the main panel. Overlay (dimmed backdrop) and ✕ button in sidebar header close it. Dump bar and chat input use touch-friendly sizing (min-height 48px, font-size 16px to prevent iOS zoom). Main content uses full width when sidebar closed. Auto-scroll-to-bottom of the chat message list skips when focus is in any `input` or `textarea` so it does not fight the on-screen keyboard.

**Modes tab:** List of modes (name, trigger phrase if any, instruction). Create new mode, Edit, Activate, Delete buttons. Activate sets `activeMode`; active mode indicator appears near chat input with Clear button. Active mode is React state only — resets when switching conversations or refreshing the page. No dump bar.

**Knowledge tab:** Dump Bar at top (paste text, Dump button; context question and similarity flow). Below: filter buttons (all, people, projects, notes, external), list of knowledge records with delete. Two sections: dump at top, browse below. Record display: uses `getSummaryFromStructuredData(structured_data)` (content/summary/text) with fallback to `raw_text` when structured_data has no displayable content. Fetches via GET /api/knowledge.

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
- **Database:** Supabase Postgres
- **Vector search:** `pgvector` (`vector(768)`), cosine distance via `<=>`, `ivfflat` index
- **Embeddings:** Gemini `gemini-embedding-001` (via `embedContent`) with `outputDimensionality: 768`.
- **Claude models:**
  - Intake Agent: `claude-haiku-4-5-20251001`
  - Chat Agent: `claude-sonnet-4-6`
- **Frontend:** React 18, Tailwind CSS
- **Other:** `uuid` for IDs, `jsonrepair` for malformed JSON from Claude, `react-simple-code-editor` + `prismjs` for Journal markdown syntax highlighting

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

**Implementation:** Reads `GEMINI_API_KEY` via `getEnv("GEMINI_API_KEY")`, then POSTs to `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent` with body `{ model: "models/gemini-embedding-001", content: { parts: [{ text }] }, outputDimensionality: 768 }`. Converts `embedding.values` to Float32 Buffer.

**Requirements:** `GEMINI_API_KEY` with active Gemini API quota/access for embedding requests.

**Re-embed after Ollama → Gemini migration:** If knowledge was stored when the app used Ollama embeddings, chat will not "remember" it (query and stored vectors use different embedding spaces). Run once: `POST /api/admin/reembed` (no body). This re-embeds every knowledge row with Gemini and fixes retrieval. New dumps after the migration are already Gemini-embedded.

---

## 9. Active Bugs or Issues Currently Being Debugged

**Open: Context retrieval not resolved.** Chat sometimes reports having no retrieved context for stored knowledge (e.g. "who am I", "do you know Landon", codewords) even after re-embedding. Knowledge appears in the Knowledge panel and `POST /api/admin/reembed` has been run; the issue of retrieval/use of that context in chat is not yet resolved. Debug endpoints (`/api/debug/knowledge`, `/api/debug/search`) can be used to inspect what chunks are returned for a query. Relevance/confidence handling happens in the chat agent prompt over the retrieved chunk set. Consider removing debug endpoints before production.

**Resolved (Knowledge tab "No content"):** Some nodes displayed "(No content)" despite having tags. Root cause: GET /api/knowledge did not return `raw_text`; the Knowledge tab only used `getSummaryFromStructuredData(rec.structured_data)` which looks for `content`, `summary`, or `text` in `structured_data`. When Claude returned a different structure (e.g. missing those keys), the display showed "(No content)" even though `raw_text` had the content in the DB. Fix: (1) added `raw_text` to the GET /api/knowledge SELECT and response; (2) Knowledge tab now uses `getSummaryFromStructuredData(rec.structured_data) || rec.raw_text` as fallback.

---

## 10. Decisions and Conventions

1. **Modules:** Only `people`, `projects`, `notes`, `external`. Enforced by CHECK. Schema never changes without explicit discussion.

2. **Chunking (intake):** 600-word threshold; 400–500 words/chunk; 75-word overlap; break on paragraphs → sentences → words.

3. **Embeddings:** Gemini `gemini-embedding-001`, 768 dimensions. Stored in Postgres as `vector(768)` (pgvector). OpenAI package kept in package.json for potential future use.

4. **Vector search:** pgvector cosine distance (`<=>`) with `ivfflat` index; top 15 retrieval for navigation and top 1 for similarity-check. This increases prompt/context size sent to reasoning/chat, but does not add API calls.

5. **Dynamic imports in API routes:** Agents imported via `await import("@/lib/...")` to keep API route startup light.

6. **Database adapter layer:** `lib/db.js` preserves `prepare().all/get/run` shape while executing Supabase operations asynchronously under the hood.

7. **instrumentation.js:** Preloads `lib/db.js` when Node server starts (`NEXT_RUNTIME === "nodejs"`). Starts periodic backup helper (legacy SQLite backup; harmless if no `nexus.db` file exists). `NEXUS_BACKUP_INTERVAL_MS` override still supported.

8. **Fetch URLs:** Use `window.location.origin + path` to avoid base-path issues.

9. **Error handling:** API routes return JSON `{ error }`; frontend uses `res.text()` first, skips JSON parse if body starts with `<` (HTML error page).

10. **Path alias:** `@/` → project root (tsconfig paths).

11. **Lib files:** CommonJS (`require`/`module.exports`); API routes: ESM (`import`/`export`).

12. **Claude JSON:** Strip markdown code fences before JSON.parse. Use jsonrepair on parse failure (intakeAgent).

13. **Conversation format:** `{ role: "user"|"assistant", content: string }`; chatAgent normalizes structured content to string.

14. **Embedding migration:** Switching embedding models requires regenerating stored embeddings in `knowledge.embedding` so dimensions/semantic space match query embeddings.

15. **Claude model split:** Intake uses Haiku (lightweight classification/tagging). Reasoning and Chat use Sonnet for best reasoning quality.

16. **Dev server port:** Fixed at 3000 via `npm run dev` script (`next dev -p 3000`).

17. **Rejected:** OpenAI embeddings — 403 project access. Replaced with Gemini embeddings.

18. **Rejected:** Per-route body size or timeout config — not added; large dumps may hit limits.

19. **Active mode:** Lives in React state only. Resets to null when user switches conversations (sidebar click or New Chat) or refreshes the page. Never stored in database or written into conversation history. When set, its `instruction` is sent as `activeModeInstruction` to the chat API and prepended to the system prompt.

20. **Mobile responsive:** Breakpoint 768px. Sidebar collapsible on mobile (position fixed, transform for slide). Closed sidebar: `pointer-events: none`; open: `pointer-events: auto`. Touch targets ≥48px for dump/chat inputs and buttons. globals.css uses `@media (max-width: 768px)` for mobile overrides. Desktop layout unchanged.

21. **UI Cursor rule:** `.cursor/rules/nexus-ui-layout.mdc` (globs: `components/**/*.jsx`, `app/globals.css`, `app/page.tsx`) documents overflow, tab strip scrolling, chat flex/scroll behavior, and mobile focus/touch expectations. `.cursor/rules/nexus-context.mdc` remains the always-on project/architecture rule.

22. **Auth:** NextAuth.js v5 (beta) with Google OAuth only. Config in `auth.ts`; route handler at `app/api/auth/[...nextauth]/route.ts`. Middleware exports `auth` from auth.ts; `authorized` callback allows `/login` and `/api/auth/*` without session, redirects all other routes to `/login` if unauthenticated. Login page at `/login` uses direct link to `/api/auth/signin/google?callbackUrl=/`. `auth.ts` sets `NEXTAUTH_URL` dynamically when unset: `https://${VERCEL_URL}` on Vercel, `http://localhost:3000` locally. **Production:** `NEXTAUTH_URL` is set explicitly in Vercel to the canonical hostname (see **Deployment**) so preview URLs do not break OAuth. Single-user system — no user IDs in DB, no per-user data isolation.

23. **Vercel persistence:** App persistence now relies on Supabase Postgres (durable cloud DB), not local SQLite files.

24. **Deployment documentation:** This file’s **Deployment** section records the live Vercel/GitHub URLs, applied migrations, Vercel env vars, and OAuth gotchas. `DEPLOYMENT.md` remains a general guide (env vars, migrations overview, Google callback setup).

25. **Journal isolation:** Journal data is browser-local only (IndexedDB). No Supabase, no `/api/*` calls, no AI/agent integration.

---

## 11. Current Build Status of Every Component

| Component | Status |
|-----------|--------|
| **Left Sidebar** | Working. 250px fixed on desktop. On mobile: collapsible overlay, hamburger to open, overlay/✕ to close, auto-closes on conversation select or New Chat. "Chats" header, "New Chat" button, search input (300ms debounce). Folders at top (New Folder, expand/collapse, rename/delete via ⋮). Divider, then ungrouped threads. Each thread: name + updated_at, ✎ rename, ⋮ move to folder, ✕ delete. Active highlighted. |
| **Delete chat** | Working. ✕ button on each conversation, confirms, DELETE /api/conversations/[id], refreshes list. If deleted conversation was active, switches to New Chat. |
| **Rename chat** | Working. ✎ button opens inline edit, PATCH with new name on Save/Enter/blur, Cancel/Escape to abort. |
| **Right Main Panel** | Working. Tab bar (Chat, Knowledge, Modes, Profile, Journal) with horizontal scroll on narrow viewports; active tab content. Dump bar only in Knowledge tab. |
| **Journal tab** | Working. Local-only IndexedDB notes. Two-panel layout (search/tree + markdown editor), autosave, rename/delete/create via menus, recursive folder delete, and drag/drop note->folder + folder->folder with invalid-drop guards. |
| **Dump Bar** | Working. Lives in Knowledge tab only, at top above records list. Single-line input, Dump button, POST /api/intake, shows confirmation or error. Touch-friendly on mobile (48px min height). |
| **Chat Panel** | Working. Messages area (flex, `min-height: 0`, vertical scroll; markdown/user rows use `min-width: 0` + `.markdown-body` word wrap). Model selector, active mode indicator (when mode active), input (`readOnly` while streaming or save flow; Send disabled), POST /api/chat with model + activeModeInstruction, streams response. Touch-friendly inputs on mobile. Renders loaded conversation history in same bubble format. Save-from-chat: ask "dump this" or "save this" in natural language — AI summarizes, asks context question, triggers dump bar flow. |
| **Modes tab** | Working. List of modes, Create/Edit/Activate/Delete. Activate sets active mode; indicator near chat input with Clear. |
| **New Chat** | Working. Clears active conversation and history, resets to blank state. |
| **New conversation creation** | Working. On first message when no active conversation: POST /api/conversations, set id, send through chat, PATCH after response, auto-name via Claude Haiku, update sidebar in real time. |
| **PATCH after response** | Working. After every AI response (new or existing), PATCH /api/conversations/[id] with full messages array. |
| **Search** | Working. GET /api/conversations/search?q=... as user types (debounced). Clear input → full list. |
| **Conversation loading** | Working. On mount: GET /api/conversations, auto-load most recent. On sidebar click: fetch list (search or full), load selected conversation's messages into chat. |
| **Intake API** | Working. Validates rawText, runs intakeAgent, returns JSON. |
| **Chat API** | Working. Runs Navigation → Chat, streams response. |
| **Intake Agent** | Working. Chunking, Claude Haiku, Gemini embed, DB insert, jsonrepair fallback. |
| **Navigation Agent** | Working. Gemini embed + Supabase pgvector cosine search (via db adapter/RPC), returns top 15 chunks. |
| **Chat Agent** | Working. Builds context, supports model selection (Claude/Gemini), prepends activeModeInstruction when provided, streams response. |
| **Database** | Working. Supabase Postgres + pgvector (`vector(768)`), same logical tables and fields as before. |
| **Embeddings** | Working. Gemini `gemini-embedding-001`, 768 dims via `embedContent`. |
| **Debug /api/debug/knowledge** | Working. Returns row count and sample. |
| **Debug /api/debug/search** | Working. Returns chunks for a query. |
| **GET/POST /api/conversations** | Working. List all or create new conversation. |
| **PATCH /api/conversations/[id]** | Working. Update messages and/or name. |
| **DELETE /api/conversations/[id]** | Working. Delete conversation. |
| **POST /api/conversations/[id]/name** | Working. Generate title via Claude Haiku. |
| **GET /api/conversations/search** | Working. FTS search across name and messages. Returns folder_id. |
| **GET/POST /api/folders** | Working. List or create folders. |
| **PATCH/DELETE /api/folders/[id]** | Working. Rename folder or delete (threads become ungrouped). |
| **GET /api/modes** | Working. List all modes. |
| **POST /api/modes** | Working. Create mode. |
| **PATCH /api/modes/[id]** | Working. Update mode. |
| **DELETE /api/modes/[id]** | Working. Delete mode. |
| **Frontend error handling** | Working. 404 message, JSON parse guard for HTML, stream error append. |
| **Build** | Working. `npm run build` succeeds. |
| **Lint** | Working. `npm run lint` passes. |

**Auth:** NextAuth.js with Google OAuth. Middleware protects all routes except `/login` and `/api/auth/*`. Unauthenticated users redirect to `/login`. Sign-in lands on home page (`/`). Single-user system — no user-specific data isolation in DB.

**Not built:** No file upload for dump, no maxDuration or body size limits on API routes, no "remember in chat" (chat cannot add to knowledge base).

---

## 12. Troubleshooting

**"Cannot find module './XXX.js'" or page 500:** Corrupted `.next` cache. Fix: Stop dev server, delete `.next` folder (`Remove-Item -Recurse -Force .next`), restart `npm run dev`. If port 3000 is in use, kill the process first.

**"Chat failed" or Gemini embedding errors:** Ensure `GEMINI_API_KEY` is set and Gemini API quota/access is active for the project used by the key.

**Mobile sidebar stuck or chat input hidden:** Sidebar is hidden by default on mobile. Tap the hamburger (☰) in the top-left of the main content to open chats. Tap overlay or ✕ to close. Main content uses full width when sidebar is closed.

---

## 13. Configuration Files (Exact Contents)

**next.config.js:**
```javascript
const { loadEnvConfig } = require("@next/env");

// Ensure .env.local is loaded before config (helps with env availability)
loadEnvConfig(process.cwd());

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fixed port 3000 via package.json "dev" script
  env: {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  },
};
module.exports = nextConfig;
```

**instrumentation.js:**
```javascript
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/db.js");
    const { startPeriodicBackup } = require("./lib/backup.js");
    startPeriodicBackup();
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
| AUTH_SECRET | Yes | NextAuth session/encryption secret. Generate with `npx auth secret`. |
| GOOGLE_CLIENT_ID | Yes | Google OAuth client ID (Google Cloud Console) |
| GOOGLE_CLIENT_SECRET | Yes | Google OAuth client secret |
| GEMINI_API_KEY | For Gemini | Required when using Gemini models (2.0 Flash, 2.0 Pro) |
| SUPABASE_URL | Yes | Supabase project URL (`https://...supabase.co`) |
| SUPABASE_ANON_KEY | Yes | Supabase anon public key (used by server-side Supabase client in this project) |
| SUPABASE_SERVICE_ROLE_KEY | Yes (prod) | Server-only; bypasses RLS for knowledge-folder admin client paths in `lib/supabase.js`. Set in Vercel; never expose to the browser. |
| OPENAI_API_KEY | No | Unused; kept for potential future use |
| NEXUS_BACKUP_INTERVAL_MS | No | Backup interval in ms (default 3600000 = 1 hour). Min 60000. |
| VERCEL_URL | Auto on Vercel | Used to derive `NEXTAUTH_URL` in `auth.ts` when `NEXTAUTH_URL` is unset. |
| NEXTAUTH_URL | Recommended (Vercel prod) | Canonical site URL for NextAuth (e.g. `https://nexus-vercel-for-real.vercel.app`). Set in Vercel so **preview** deployments do not use dynamic hosts and trigger Google **`redirect_uri_mismatch`** (see **Deployment**). |

**Gemini embeddings:** Uses `GEMINI_API_KEY` against the Generative Language API `embedContent` endpoint (`gemini-embedding-001`, 768 dims).

**Google OAuth:** Add redirect URIs in Google Cloud Console credentials:
- `http://localhost:3000/api/auth/callback/google` (local)
- `https://nexus-vercel-for-real.vercel.app/api/auth/callback/google` (production — current Vercel deployment)

---

## 15. Dependencies (package.json)

**Runtime:** @anthropic-ai/sdk, @google/genai, @supabase/supabase-js, jsonrepair, next 14.2.18, next-auth (Google OAuth), openai (unused), pg, prismjs, react, react-dom, react-simple-code-editor, uuid

**Dev:** @types/node, @types/react, @types/react-dom, @types/uuid, eslint, eslint-config-next, postcss, tailwindcss, typescript

---

## 16. User Profile System (New)

### user_profile table

Migration: `supabase/migrations/005_user_profile.sql`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT | PRIMARY KEY, default `gen_random_uuid()::text` | Facet ID |
| user_id | TEXT | NOT NULL | Auth-derived user key (currently email fallback) |
| category | TEXT | NOT NULL | Flexible facet grouping (not enum-constrained) |
| content | TEXT | NOT NULL | Facet statement content |
| confidence | TEXT | NOT NULL, default `established`, CHECK in (`emerging`, `established`, `foundational`) | Stability level |
| source | TEXT | NOT NULL, default `manual` | Origin metadata (`manual`, `consolidation`, `system`) |
| created_at | TEXT | NOT NULL | ISO timestamp string |
| updated_at | TEXT | NOT NULL | ISO timestamp string |
| active | BOOLEAN | NOT NULL, default true | Soft-delete flag |

Indexes:
- `idx_user_profile_user_id` on `(user_id)`
- `idx_user_profile_category` on `(category)`
- `idx_user_profile_active` on `(active)`

### Profile assembly flow

- Shared module: `lib/profile.js`
  - `getActiveProfile(userId)` returns active facets sorted by category/created_at
  - `assembleProfileBlock(userId)` groups facets by category and formats prompt-ready text
  - Includes first-run seed insertion for a user if they have no profile rows yet
- Chat route integration: `app/api/chat/route.js` now calls `assembleProfileBlock(userId)` before `runChatAgent`
- Graceful degradation: if profile assembly fails, chat continues with existing behavior

### System prompt assembly order (current)

`lib/chatAgent.js` now composes the final system prompt in this order:
1. Profile block (if present)
2. Active mode instruction (if present)
3. Base NEXUS system prompt (unchanged text)
4. Retrieved chunks context block (unchanged format)

### New API routes

- `GET/POST /api/profile` (`app/api/profile/route.js`)
  - GET: active facets for current user
  - POST: create facet (`category`, `content`, optional `confidence`, `source`)
- `PATCH/DELETE /api/profile/[id]` (`app/api/profile/[id]/route.js`)
  - PATCH: partial facet updates (`category`, `content`, `confidence`, `active`)
  - DELETE: soft delete (`active=false`)
- `GET /api/profile/assemble` (`app/api/profile/assemble/route.js`)
  - Returns `{ profileBlock }` formatted for prompt injection
- `POST /api/profile/consolidate` (`app/api/profile/consolidate/route.js`)
  - Stub endpoint, returns `501 Not Implemented`

### New files

- `lib/profile.js` — profile querying, formatting, and seed bootstrap
- `lib/consolidationAgent.js` — consolidation interface scaffold (not implemented)

### Consolidation agent status

- `runConsolidation(userId, options)` exists in `lib/consolidationAgent.js`
- Currently throws `Consolidation agent not yet implemented`
- Endpoint `/api/profile/consolidate` is intentionally a 501 stub

### Chat agent changes

- `runChatAgent` signature now accepts `profileBlock` as an optional parameter
- `app/api/chat/route.js` derives user id from auth session, assembles profile block, and passes it into `runChatAgent`

### Frontend profile management UI

- `components/NexusUI.jsx` includes a new **Profile** tab with:
  - Active facets grouped by category
  - Manual add form (category + content)
  - Inline content edit
  - Soft deactivate action
  - Read-only metadata badges for confidence and source
