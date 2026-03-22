# NEXUS Deployment (Vercel)

This guide reflects the current production-ready stack:
- NextAuth (Google OAuth)
- Supabase Postgres for persistence
- pgvector (`vector(768)`) for embedding similarity search

## Required Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

### Auth

- `AUTH_SECRET` (required): NextAuth secret. Generate locally with:
  - `npx auth secret`
- `GOOGLE_CLIENT_ID` (required): from Google Cloud Console OAuth credentials.
- `GOOGLE_CLIENT_SECRET` (required): from Google Cloud Console OAuth credentials.

### AI Models

- `ANTHROPIC_API_KEY` (required): Claude API key (used by intake and chat when using Claude models).
- `GEMINI_API_KEY` (required): Google AI Studio / Gemini key. Used for Gemini chat models and for all embeddings (navigation, intake, similarity check).
- `OPENAI_API_KEY` (optional, currently unused).

### Supabase (Database)

- `SUPABASE_URL` (required): Supabase project URL.
- `SUPABASE_ANON_KEY` (required): Supabase anon key (used by the server-side Supabase client in this codebase).

### Vercel Runtime

- `VERCEL_URL` (auto-provided by Vercel): used by `auth.ts` to derive `NEXTAUTH_URL` when unset.

### Embeddings

Embeddings are provided by the Gemini API (`gemini-embedding-001`, 768 dimensions). No separate embeddings endpoint is needed; set `GEMINI_API_KEY` above.

## Database Migration (Required Before App Use)

Apply SQL migration:

- `supabase/migrations/001_init.sql`

This migration creates:
- `knowledge`, `conversations`, `modes` tables
- `vector` extension and `knowledge.embedding vector(768)`
- `knowledge_embedding_ivfflat_idx` index (`vector_cosine_ops`)
- RPC SQL functions:
  - `search_knowledge_by_embedding`
  - `find_most_similar_knowledge`

## NEXTAUTH_URL Behavior

`auth.ts` sets `NEXTAUTH_URL` dynamically if it is not already defined:

- On Vercel: `https://${VERCEL_URL}`
- Local development: `http://localhost:3000`

`VERCEL_URL` is provided automatically by Vercel.

## Google OAuth Configuration

In Google Cloud Console OAuth credentials, add redirect URIs for both local and deployed environments:

- `http://localhost:3000/api/auth/callback/google`
- `https://<your-vercel-domain>/api/auth/callback/google`

If you use preview deployments for auth testing, add preview callback domains as needed.

## Deploy to Vercel From Scratch

1. Push NEXUS to a Git repository (GitHub/GitLab/Bitbucket).
2. In Vercel, click **Add New Project** and import the repository.
3. Keep framework auto-detected as **Next.js**.
4. Create Supabase project.
5. Apply `supabase/migrations/001_init.sql` in Supabase SQL editor.
6. Add environment variables listed above.
7. Add Google OAuth callback URL for your Vercel domain.
8. Deploy.
9. Open the deployed app and test:
   - Login (`/login` + Google sign-in)
   - Chat streaming
   - Knowledge dump flow
   - Similarity check / retrieval behavior
