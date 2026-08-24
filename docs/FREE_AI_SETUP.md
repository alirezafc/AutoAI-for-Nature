# Getting real (free) AI in AutoAI for Nature

AutoAI runs in **demo mode** out of the box. Every agent, the chat, voice and
RAG embeddings are driven by the built-in deterministic `mock` provider, which
needs **no API key** — that is why the demo chat answers from keyword matches
and canned templates, and why the site shows "DEMO MODE".

To reach **LIVE AI** you need **two** things configured (both appear on the
site's status badge):

1. a **real LLM provider** (default provider/model) and
2. a **real embedding provider/model** for RAG.

If either is still `mock`, the platform stays in DEMO MODE — the mock is never
silently used on the real AI path.

## The easy way — inside the app (recommended)

You do **not** need to edit files. Open **Admin → Settings → AI Connections**:

1. Paste your API key into the matching provider field (OpenRouter, Groq,
   OpenAI, Anthropic, Gemini).
2. Pick the **default provider** and **default model**.
3. Pick the **embedding provider** and **embedding model**.
4. Click **Save & Test connection**.
5. Use **Run real test** to fire an actual chat **and** an actual embedding
   request against the configured keys and see model, latency and errors.

Keys are stored in the database and applied **live** — no restart, no `.env`
editing. You can also hit **Refresh & Reconnect** at any time to re-apply the
stored keys and re-test every connection.

## First time you run the project

Open `/admin` — on the very first run you'll be asked to **create your admin
account** right in the browser (no terminal, no env variables). After that,
sign in normally and set up your API keys in Settings.

## OpenRouter — one key for LLM + embeddings (recommended)

1. Go to <https://openrouter.ai/keys> and create a key.
2. Paste it in **Settings → AI Connections → OpenRouter**.
3. Set **default model** to `openrouter/free` — AutoAI resolves it to an
   actually-available `:free` model at request time (dynamic catalog, no
   hardcoded model names to go stale).
4. Set **embedding provider** to `openrouter` and **embedding model** to
   `nvidia/nemotron-3-embed-1b:free`, which is served through OpenRouter's
   official embeddings API (`POST https://openrouter.ai/api/v1/embeddings`).
5. Then **Re-index all** in **Admin → Knowledge** so every vector is rebuilt
   with the real embedding model — old mock vectors are deleted first, so real
   and mock vectors are never mixed.

## Option B — Groq (free, fast, chat only)

1. Go to <https://console.groq.com> and sign up.
2. Create an API key (API Keys → Create) and paste it in **AI Connections → Groq**.
3. Set the default model to a Groq model (e.g. `llama-3.3-70b-versatile`).
4. Groq does not serve embeddings, so keep the embedding provider on OpenRouter
   or OpenAI (see embeddings below).

## Option C — Google Gemini (free)

1. Go to <https://aistudio.google.com/apikey> and create a key (free).
2. Paste it in **AI Connections → Google Gemini** and pick a Gemini model.
3. Gemini also exposes embeddings through the same OpenAI-compatible surface.

## Real RAG embeddings

Every knowledge document records which embedding provider/model produced its
vectors. Retrieval only ever returns vectors from the **same** embedding model
that is currently configured, so a model switch cannot mix embeddings. After
switching the embedding provider/model, always run **Admin → Knowledge →
Re-index all** (deletes all vectors first, rebuilds every active document, and
reports per-document success/failure plus the embedding model and dimension
count).

## Advanced — environment variables (optional)

For production / Docker you can still configure everything through env vars.
Keys set in `.env.local` take precedence and are picked up automatically:

```env
OPENROUTER_API_KEY=your-key-here
DEFAULT_AI_PROVIDER=openrouter
DEFAULT_AI_MODEL=openrouter/free
DEFAULT_EMBEDDING_PROVIDER=openrouter
DEFAULT_EMBEDDING_MODEL=nvidia/nemotron-3-embed-1b:free
```

### Production requires PostgreSQL

For production you **must** set `DATABASE_URL` (a PostgreSQL connection string
with the `pgvector` extension) and run the migrations:

```env
DATABASE_URL=postgres://user:pass@host:5432/autoai?sslmode=require
```

```bash
npm run db:migrate
```

`NODE_ENV=production` refuses to boot the database without `DATABASE_URL` —
the bundled PGlite database is **local development only**. To migrate a fresh
PostgreSQL instance, run the same `npm run db:migrate` once the URL is set.

## What changes when a key is set

| Area | Demo (mock) | With a real key (live) |
| --- | --- | --- |
| Chat | keyword matching + canned templates | real reasoning, grounded in RAG sources |
| Articles | template paragraphs | real research → writing → review loop |
| Voice answers | template text | real grounded answers |
| RAG embeddings | lexical hashing (threshold 0.09) | real semantic vectors (threshold 0.4) |
| UI badge | DEMO MODE | LIVE AI |

The app is fully functional in demo mode and fully functional in live mode;
setting keys only upgrades the "brain". Everything else (human review,
timeline, knowledge editor, MCP, workflows, admin) is identical.