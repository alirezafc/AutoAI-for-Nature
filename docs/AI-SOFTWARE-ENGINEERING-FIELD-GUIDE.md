# AI Software Engineering Field Guide

*Lessons from building, debugging and shipping **AutoAI for Nature*** — an AI-native content
platform with a nine-agent editorial pipeline, grounded RAG chatbot and voice assistant — from first
commit to a frozen V1 in production.

> Case-study driven. Every lesson below traces to a real failure, investigation or fix.
> Context: Next.js · PostgreSQL/pgvector · OpenRouter (GPT-4o-mini + Nemotron embeddings) · Vercel.

---

## Start Here — 10 Minutes That Can Change How You Build AI Systems

*These are not theoretical rules. They came from things that actually broke.*

**10 min** core principles → **30 min** practical path → **deep dive** full guide below.

AutoAI started as "an AI application." Wire up a model, generate some articles, add a chatbot. How hard
could it be?

Then the seemingly simple features started opening trapdoors:

- The LLM returned perfectly valid JSON — with the wrong shape inside.
- Vectors existed in PostgreSQL, the embedding API returned 200 OK, and the chatbot still knew nothing.
- Articles were published while their agent runs sat frozen in "waiting for human".
- Login worked — but only after refreshing the page.
- Switching language flipped text direction without changing the actual language.
- A "View Article" button appeared before any article content existed.
- Voice settings rendered a full panel of options the backend never read.
- Everything passed locally and broke in production anyway.

> **The difficult part of AI software is rarely "calling the model." It is engineering everything around
> the model:** configuration resolution, state machines, retrieval pipelines, grounding policy, render
> boundaries, data lifecycles — and knowing when to stop building.

What follows is the compressed version: twelve principles, each earned through a real failure.

### The 10-Minute Core

**01 — JSON Is Not a Contract**
An LLM can return perfectly valid JSON that is completely wrong for your application.
*AutoAI:* the model returned an object where the contract demanded a string inside `outline[]`.
Lesson: syntax validity is not schema validity.
*Think:* "If my model returns valid JSON, what exactly have I proved?" *(Case Study 1)*

**02 — A Vector Is Not RAG**
Vectors in PostgreSQL prove vectors exist — not that retrieval works.
*AutoAI:* real 2048-d embeddings while chat answered "No relevant knowledge found" to everything.
Lesson: debug the entire retrieval funnel, not the database row.
*Think:* "Can I prove every stage between question and chunk?" *(§05)*

**03 — IDs Are Not State**
A post can have an ID and no usable content; a run can exist and be stale.
*AutoAI:* "View Article" appeared during generation because a placeholder post was reserved up-front.
Lesson: gate UI on business state delivered by the backend. *(Case Study 6)*

**04 — Configuration Is Architecture**
Correct code can behave incorrectly because configuration resolution is wrong.
*AutoAI:* all nine roles pointed at a demo mock because env fallbacks fired where variables were missing.
Lesson: design source → precedence → validation → fallback → failure behavior. *(§03)*

**05 — Models Have Capability Contracts**
Never assume structured outputs, context length or pricing — verify against the live catalog and degrade
in tiers. *AutoAI:* request tiers `json_schema → json_object → none` exist because capability flags differ
per model. *Think:* "If my provider swaps this model tomorrow, what breaks silently?" *(§04)*

**06 — Pipelines Are State Machines**
Persisted states, human gates, multiple executions per entity.
*AutoAI:* published articles kept runs stuck in `waiting_for_human` because finalization updated one
pointer while regeneration had created several runs. *(§07, Case Study 3)*

**07 — Grounding Must Be Deterministic**
Answer ONLY when retrieval proves relevance; otherwise refuse without calling the model.
*AutoAI:* a presidential question got a world-knowledge answer beside a "no relevant knowledge" banner.
*(§06)*

**08 — Find the First Divergence**
Decompose the path into measurable stages; fix the earliest where reality differs from expectation.
*AutoAI:* one funnel diagnostic turned three "RAG is broken" incidents into three precise root causes.
*(§12)*

**09 — Local ≠ Production**
Local ≠ Vercel ≠ Neon ≠ OpenRouter.
*AutoAI:* env-default fallbacks fired only in production; file-based local DBs are single-writer while
smoke scripts saw another world. *(§11)*

**10 — Production Proof Closes the Loop**
Finished = actual deployed path observed passing.
*AutoAI:* health endpoints, authenticated diagnostics and wire evidence (12/12 calls to the right provider)
turned "should work" into fact. *(§13)*

**11 — UI Mirrors Business State — or Lies**
Every control derives from meaningful backend state.
*AutoAI:* a voice panel offered fields the reply pipeline never read. *(Case Study 7)*

**12 — V1 Needs a Stopping Rule**
Done = acceptance criteria passing in production.
*AutoAI's freeze memo listed forbidden files by name — that memo shipped the release.* *(§17)*

### When Something Breaks, Don't Guess. Find the First Divergence.

```
EXPECTED behavior
↓ INPUT — user question arrives
↓ PROCESS — embed · filter · rank
↓ DATABASE — candidates from pgvector   (identity + status + source-type filters)
↓ RETRIEVAL — top-K above threshold
↓ MODEL — answer generation
↓ OUTPUT — grounded answer + sources
```

When the OUTPUT is wrong, the bug is often NOT at the output. In AutoAI the model was innocent every
time — divergence lived earlier: inactive document, null identity, language-coupled filter, swallowed
indexing error. Measure stages. Fix the first lie. Write the regression test.

### Got 30 Minutes?

1. Architecture → §02
2. AI failure modes → §04
3. RAG → §05
4. Agent systems → §07
5. Production → §11
6. Debugging discipline → §12
7. Real failures → §20 Case Studies

### Starting a New AI Project Tomorrow?

Before the first line of code:

- [ ] What does "done" mean — observably?
- [ ] What is explicitly V1? What is V2?
- [ ] What is the source of truth for each piece of state?
- [ ] Where is the state machine — including human gates?
- [ ] What happens when the AI returns malformed data?
- [ ] What happens when the provider is unavailable?
- [ ] How are embeddings identified (provider/model/dimensions)?
- [ ] How will I PROVE RAG works, stage by stage?
- [ ] How do I prove production works, not just local?
- [ ] What is my rollback strategy?
- [ ] What will make me stop working on this?

---

*You now know the rules. Here's where they came from.*

None of the principles were invented beforehand — they were extracted from real failures, debugging
sessions and production verification. The seven case studies below carry the full investigations.

---

## 01 — The Engineering Mindset

Most failed AI projects are not killed by models. They are killed by undefined scope, undefined "done",
and endless polishing that replaces shipping.

**Don't start by coding.** AutoAI began with questions: what happens when the pipeline finishes? Who
decides an article is publishable? What if the model returns garbage? The answers produced the review
gate (`waiting_for_human`) and the mock-provider veto long before they were needed — which is why they
held up under pressure.

**Define what "done" means first.** For AutoAI V1 it was explicit:

- A Persian or English topic produces a full article through nine agents and reaches `waiting_for_human`.
- Human approval publishes → article indexed → immediately answerable by chat.
- Off-topic questions are refused — never answered from general model knowledge.

Every later scope argument was settled against those three lines.

**V1 vs V2 is a survival decision.** Near release we froze in writing: no dashboard redesign, no
pipeline animation work, no new voice providers, no RAG edge calibration. Each reopens verified surface.
The final commit is literally `fix: finalize V1 article and voice UX`. Finishing is a feature.

> **How to know when to stop.** A project is done when its acceptance criteria pass *in production* —
> not when you run out of ideas. If your discovered-issue list grows faster than your fix list, you are
> polishing, not shipping.

**Deterministic state over assumptions.** The most repeated mistake: treating *existence* as *readiness*.
A post row existed during generation → UI showed "View Article". A knowledge document existed → everyone
assumed retrieval worked. Derive behavior from meaningful persisted state, always.

**"The code works" ≠ "the product works."** AutoAI passed hundreds of unit tests while production login
hung on first click and RAG refused every question. Product correctness spans browser → API → cookie →
middleware → database → third-party API → back.

---

## 02 — Architecture Before Implementation

Architecture is deciding in advance where truth lives — so when reality disagrees with you, you know
exactly which layer lied.

| Question | Single source of truth | What we stopped doing |
|---|---|---|
| Which model handles the strategist? | Purpose config chain: override → connection default → bootstrap → fallback | Scattered env reads per module |
| Is this document searchable? | `active` + allowed source_type + matching embedding identity | Assuming "row exists" |
| Is the article viewable? | `postStatus` + `postHasContent` read live from DB | `run.postId ? show : hide` |
| User language? | `autoai_locale` cookie → messages + direction | Treating RTL as language state |

**Pre-code checklist**

1. Where does this data come from?
2. Who owns it?
3. Where is it persisted, and what is its lifecycle?
4. Who can change it after creation?
5. How is it validated at every boundary?
6. What happens when the external dependency fails?
7. How will production observe it?
8. How is it tested at each layer?
9. How is it deployed, migrated, rolled back?

Draw failure boundaries explicitly: provider failure → primary/fallback/loud-fail; publish-time indexing
failure → surfaced, never swallowed; grounding miss → deterministic refusal without an LLM call.

---

## 03 — Configuration Is Part of the Architecture

AutoAI shipped correct code that pointed all nine AI roles at a demo mock:

```
AI is not configured for real generation:
idea: still points at the mock provider; strategist: still points at the mock provider; …
```

Cause: purpose resolution fell back to `process.env.DEFAULT_AI_PROVIDER || "mock"` — variables that don't
exist on Vercel — while the real OpenRouter key sat in a separate settings surface with no precedence
relationship.

> **Lesson:** a system can contain correct code and still behave incorrectly because configuration
> resolution is wrong.

**The precedence chain that fixed it:**

```
effective = 1. explicit per-purpose override   (Models page)
            2. connection default               (Admin → AI Connections)
            3. documented bootstrap             (real credential + nothing configured)
            4. demo / mock                      (dev & tests only)
```

Every production dependency needs five answers: **source · precedence · validation · fallback · failure
behavior**.

Mock is a test fixture: hard-fail outside the test runner via an env guard, so fake answers cannot ship
while mocks stay usable in unit tests.

---

## 04 — AI Providers and Model Abstraction

Providers are swappable infrastructure with per-model capabilities; every model response is untrusted
input until validated.

**Model identity:** every stored embedding carries `{provider, model, dimensions}`; queries refuse to
compare vectors unless identity matches exactly. Vectors from different models must never coexist.

**Capabilities are data:** context length, pricing, supported parameters and structured-output support
come from the live provider catalog. Never assume JSON-schema support — ask, and degrade deliberately.

**The structured-output incident:**

```
Schema validation failed at "outline.0": Expected string, received object
— after 3 attempts on openrouter/openai/gpt-4o-mini
```

The model answered `{"outline":[{"angle":"…"}]}` where the contract demanded `outline: string[]`. The
prompt embedded top-level keys as null hints; requests used bare `json_object`; retries replayed the same
ambiguity.

> **Anti-pattern:** treating successful `JSON.parse` as validation. An LLM response is not trustworthy
> merely because it is JSON.

**The defense:**

1. One canonical schema — Zod compiled to JSON Schema feeding both native `json_schema` mode and prompt.
2. Native structured outputs with tiered downgrade `json_schema → json_object → none`.
3. Strict local validation quoting exact paths into repair requests.
4. Bounded repair loop, then loud failure — never silent templates.
5. Wire-level tests asserting actual request bodies (`items.type == "string"`).

Fallback records every attempt and reports `fallbackUsed`. It survives outages; it does not quietly swap
a different model whose outputs drift from what you validated.

---

## 05 — RAG: Never Trust the Surface

Retrieval failed in production while the database held exactly what everyone assumed it needed:
published documents and real 2048-d vectors.

### The funnel

```
User question
↓ Query embedding (provider/model/dimensions)
↓ Candidate vectors
↓ Active documents only
↓ Allowed source types
↓ Embedding identity match
↓ Cosine similarity
↓ Relevance threshold
↓ Top-K chunks
↓ Grounding decision
↓ LLM response with citations
```

> Vectors existing in the database does NOT mean RAG works. Six mechanisms sit between the vector table
> and the answer, each able to return nothing.

### Every way it actually broke

| Stage | Real failure | Detection |
|---|---|---|
| Status filter | Draft docs stayed `inactive` forever even after publish (update helper ignored the columns) | Visible in admin, absent from search |
| Source type | Stuck `draft_article`; retrieval whitelisted `article` only | Column inspection |
| Embedding identity | `(null,null,null)` groups — created but never successfully indexed; divergent model strings | `GROUP BY provider,model,dims` |
| Language filter | UI locale restricted corpus; EN question over FA-only docs = zero by construction | Funnel counters collapsed at that stage |
| Threshold | Cross-language similarity varies 0.22–0.60 for genuinely related pairs vs fixed 0.4 | Live embedding probes |
| Ingestion errors | Publish indexing failures swallowed by `.catch(() => {})` | Confident metadata beside empty vector tables |
| Lying metadata | `chunk_count = 5`, zero chunk rows | Join count documents↔chunks |

### Diagnose one stage at a time

Instrument ONE query through the whole funnel and print per-stage counts, stored identity buckets,
top similarities and threshold. The stage that collapses names the bug. Example smoking gun: an identity
bucket `{provider: null, model: null, dimensions: null, documents: 3, vectors: 0}`.

### Debugging checklist

1. Pick one known document: active? source_type? post link correct?
2. Count REAL vector rows (join chunks — never trust `chunk_count`).
3. Read stored embedding identity off the document row.
4. Embed the test question with the same configured identity; confirm dimensions.
5. Run the funnel with per-stage counters; find the collapse point.
6. Probe paraphrases plus an unrelated baseline before touching thresholds.
7. Recalibrate with measurements if needed — never blind-lower.
8. Add a regression test for exactly the lying stage.

> Cross-language reality: same model measured FA→EN twin 0.224, FA→EN other-topic 0.511, EN→FA 0.433.
> Pair-dependent variance demands measured calibration — and corpus selection must never couple to UI locale.

---

## 06 — Grounding and AI Safety

A RAG chatbot becomes a generic chatbot by accident, one helpful completion at a time.

AutoAI's contradiction: user asked *"Who is the current president of the United States?"* — the app
claimed knowledge-grounding while the assistant answered from world knowledge plus "No relevant knowledge
found". Both statements true; zero grounding present.

**Three layers:**

```
retrieval  → does relevant knowledge exist?   (measured)
policy     → is answering allowed?             (grounding guard)
generation → LLM sees ONLY permitted context
```

Rules that hold:

- **Deterministic refusal before generation** — nothing relevant ⇒ fixed sentence, empty sources, no LLM call. No hallucination when no token exists.
- **Refusal normalization** — a refusal returned inside a grounded call clears sources/markers; otherwise fake attributions leak into history and metrics.
- **Refusals never anchor context** — follow-ups walk back to the last GROUNDED exchange (sources present, content not itself a refusal).
- **Bounded follow-ups** — anchored topic + follow-up text re-retrieved against the same threshold; still refusable.
- **Exact-refusal instructions** give the model a legal deterministic out.

Acceptance triplet for any grounding change: on-topic must cite; unrelated must refuse with empty sources;
anchored follow-up must stay grounded — run against real embeddings.

---

## 07 — Agent Pipelines Are State Machines

Not "call AI several times." A stateful workflow with human gates, partial failures and multiple
executions per entity.

Flow: `idea → strategist → researcher → writer → critic (+revision) → seo → publisher → final_critic →
lessons`; run states `queued → running → waiting_for_human → completed | failed | cancelled`. Each step
persists status/provider/model/latency/score/retries/error.

**Incident:** articles visibly published; their runs stuck in `waiting_for_human`.

Wrong guesses first ("frontend cache", "wrong run updated"). Truth:

```
approveArticle() finalized ONLY posts.agent_run_id.
Regeneration creates a NEW run for the SAME post and re-points that column.
⇒ older linked runs stayed waiting_for_human forever.
```

> One entity can own MULTIPLE workflow executions. Finalization sweeps by foreign key — never by a single
> cached pointer.

Rules: persist transitions immediately (DB = state machine); human decisions are transitions too; hook
finalization at the shared service boundary so every publish path triggers it; idempotent sweeps; zombie
`running` rows reclaimed by grace period.

---

## 08 — Database State vs Business State

"The row exists" ≠ "the entity is valid."

| Exists… | …but logically |
|---|---|
| post row during generation | content empty |
| knowledge document | inactive → invisible |
| document chunk_count 5 | zero chunk rows |
| vectors present | identity mismatched → unreachable |
| run waiting_for_human | article already published |
| voice settings panel rendered | fields backend never consumed |

Make validity explicit: treat transitions as business events implemented in the data layer; expose
readiness through APIs from meaningful fields; schedule integrity checks (orphans both directions, stale
executions, identity buckets) as health metrics.

---

## 09 — Data Lifecycle

Content lifecycle: create → draft → review → publish → index → update → re-index → delete. Related
entities move together:

```
Post ──▶ Agent Runs ──▶ Agent Steps
  └────▶ Knowledge Document ──▶ Chunks ──▶ Vectors
```

Publish promotes the document (`draft_article/inactive → article/active`) and re-indexes under current
identity. Editing a published post re-syncs it. Deletes leave zero orphans both directions.

Cleanup ran as reviewed engineering:

1. Dry-run printing exact rows (id/title/status/createdAt).
2. Prefix→UUID resolution asserting exactly-one match.
3. Keep-list safety assertions (protected ids exist, appear in no delete set).
4. FK-safe order: messages → conversations → chunks → documents → steps → runs → posts.
5. No TRUNCATE. Ever.
6. Post-verify: deleted gone; keep-list intact; orphans zero; survivor integrity.

> Never "delete everything that looks like test data." Explicit IDs + dry-run + keep-list — every time.

---

## 10 — Migrations and Real Databases

Embeddings 1536 → 2048 is not `ALTER COLUMN`. Old vectors are permanently incompatible; mixing corrupts
every search. Fixed order:

```
accept old vectors are dead
→ wipe/rebuild dependent vector data
→ migrate schema vector(1536) → vector(2048)
→ re-index EVERYTHING under the new model
→ verify identity metadata everywhere
```

Tie dimensions to one constant used by column type AND runtime validator; never truncate or pad —
mismatch fails loudly and demands full re-index.

> PGlite passing locally cannot prove PostgreSQL behavior (extensions, planners, locks, concurrency).
> Verify critical DB behavior on the real engine — including single-writer assumptions your cross-process
> smoke scripts will hit.

---

## 11 — Local ≠ Production

local ≠ Vercel ≠ Neon ≠ OpenRouter.

- Env defaults fire where variables are missing — production-first (`|| "mock"` became nine broken purposes).
- Auth rules differ by design: dev accepts seed credentials; prod rejects them and must not display hints about them.
- Cookies & middleware behave differently behind edge deployments (first-login hang).
- Runtime concurrency: local file databases are single-writer; smoke scripts see a different world than the app process.
- Data drift: null identities, mixed languages, stale runs accumulate only in production.
- Provider catalogs drift: free models vanish; hardcoded catalogs become outages.

> **Production proof:** a feature is finished when the ACTUAL deployed path passes — real URL, session,
> database, keys, observed via network tab or diagnostics endpoints. Until then: "works locally".

---

## 12 — Debugging: Find the First Divergence

```
Expected → Observed → Stages → Measure each → FIRST divergence
→ Fix root cause → Regression test → Production verify
```

**RAG showcase:** "no knowledge for everything" decomposed into the §05 funnel; per-stage counters split
three distinct incidents (identity mismatch, stale statuses, language-coupled corpora). Three root causes,
one diagnostics endpoint, zero random changes.

**Login showcase:** form → POST login → 200 + Set-Cookie ✓ → `router.push("/admin")` ✗ client cache held
the unauthenticated payload → `router.refresh()` raced the push → spinner hung. Manual refresh warmed the
cache, explaining attempt #2. Fix: full-document navigation after auth so middleware always sees the fresh
cookie. Guessing "session bug" would have rewritten working auth.

> Random fixing changes code; measurement changes understanding. Name the first divergence and everything
> upstream is exonerated, everything downstream irrelevant.

---

## 13 — Testing AI Systems

| Layer | Proves | AutoAI example |
|---|---|---|
| Unit | Pure decisions | config-precedence matrix · view gate · refusal thresholds |
| Contract | Public shapes honest | voice settings expose exactly 3 real fields |
| Regression | Historical bug stays dead | `outline[0]` rejection · i18n parity |
| Wire-level | Actual HTTP contracts | stubbed fetch asserting `response_format.json_schema.strict` + item types |
| Real provider | Model behaves | Persian/English structured outputs vs live gpt-4o-mini |
| Real database | Storage behaves | pgvector dims, orphan sweeps, funnel counters on Neon |
| Production smoke | Deployed path works | health + authenticated diagnostics on live URL |

> Mock PASS proves logic. OpenRouter PASS proves product. The structured-output bug passed every mock test
> while failing every real request — the mock fills keys by name instead of negotiating schemas.

Counts grew 49 → 83 through the fixes; the layers — not the numbers — carried the value.

---

## 14 — Security and Secrets

- Keys execute server-side; browsers get sanitized catalogs and booleans. Verified by scanning admin response bodies for key fragments.
- Secret-scan every commit: key prefixes, connection strings, private-key headers, passwords over staged diffs. Eight pushes, zero leaks — because it always ran.
- Temporary injection pattern: credential staged in OS temp file → read into env per command → deleted after; never echoed or committed.
- Dev-only messaging is surface: ".env.local" hint shipped inside translation JSON past component review — removed at both layers with regression greps over message files and built bundle.
- Demo credentials rejected by design in production; bootstrap requires explicit environment configuration.
- Hardening stack: open-redirect guard post-login, httpOnly+SameSite cookies, middleware-guarded admin APIs, AUTH_SECRET length enforcement, session tokens treated as revocable secrets.

> Treat EVERY authenticator (keys, cookies, connection strings) with one lifecycle: inject → use → destroy → verify destroyed.

---

## 15 — I18N Is Not Just Translation

Report: switching to Persian left English strings; switching back changed only direction.

Contract:

```
locale ("fa"|"en") ├─▶ messages[locale]
                   └─▶ dir = rtl|ltr   (derived — NEVER the language state)
```

Breakage: switcher wrote cookie + updated client dictionaries, but server-rendered components were
generated under the old cookie — direction flipped instantly, strings lagged until a later full request.

Fix set: `setLocale` triggers `router.refresh()`; one year-long cookie read identically by layout, server
helper and client provider; key-parity regressions (633=633, no empties); direction derived via
`isRTL(locale)` on both render paths.

> Direction is presentation; locale is data. Inferring language FROM `dir` couples systems that must
> evolve independently. Also audit bundles: a dev-only credential hint had shipped inside translations.

---

## 16 — UI Should Reflect Real System State

During generation users clicked "View Article" into an empty shell; guard was `run.postId != null` — true
from millisecond one of pipeline reservation.

| ID exists… | …≠ meaningful state |
|---|---|
| post.id | viewable content |
| knowledge_document.id | searchable |
| agent_run.id | currently executing |
| voice panel rendered | settings consumed |

Fix pattern: API exposes REAL state (`postStatus`, `postHasContent`) read live from DB; pure gate function
with matrix tests; verified end-to-end by flipping a published article to empty-draft and back through the
admin API — gate hid, integrity restored.

Same principle caught the voice panel rendering inputs for fields the runtime never read. Rewritten to a
live capability status plus exactly the consumed controls, enforced by a contract test on the exposed key
set.

> UI actions derive from meaningful business state delivered by the backend — never identifier existence,
> timers, or guesses about async progress.

---

## 17 — Scope Control and V1/V2

| Class | Definition | Real example |
|---|---|---|
| P0 | Blocks core workflow/correctness/security | purposes→mock; RAG returning nothing; login hang |
| P1 | Important, contained | language-filtered retrieval; honest voice panel |
| P2 | Polish | animations, dashboard layout, loading micro-states |
| V2 | Future capability | voice providers, image system, threshold research |

Five-question gate: blocks core workflow? breaks correctness? security risk? prevents demonstration?
requires architectural change? Any YES → now; all NO → written-down V2 backlog, closed deliberately.

> Endless polish kills: every improvement to finished code re-opens verified surface and spends trust.
> The freeze memo named forbidden files explicitly — that memo shipped the release.

---

## 18 — The Complete AI Project Checklist

**Phase 0 — Define:** ☐ problem ☐ user ☐ success criteria ☐ V1 scope ☐ V2 backlog

**Phase 1 — Architecture:** ☐ sources of truth ☐ data lifecycle ☐ state machines incl. human gates ☐ external dependencies + failure boundaries ☐ config precedence

**Phase 2 — AI:** ☐ provider abstraction ☐ capability verification ☐ structured output strategy ☐ embedding model + frozen dimensions + provenance ☐ fallback policy ☐ guarded mocks

**Phase 3 — Data:** ☐ schema+constraints+indexes ☐ vector dims tied to one constant ☐ re-index strategy ☐ cleanup tooling (dry-run/keep-list/orphans)

**Phase 4 — RAG:** ☐ ingestion+chunking ☐ publish/update/delete index hooks ☐ metadata (type/status/identity/timestamps) ☐ instrumented funnel ☐ calibrated threshold ☐ grounding+refusal+anchors

**Phase 5 — Agents:** ☐ persisted state machine ☐ step tracking ☐ multi-execution support ☐ human gate + terminal sweep ☐ zombie reclaim

**Phase 6 — Security:** ☐ secrets server-side + commit scans ☐ authn/authz guards ☐ production mock protection ☐ no dev messaging in prod bundles

**Phase 7 — Testing:** ☐ unit ☐ contract ☐ wire-level ☐ regression ☐ real provider ☐ real database ☐ production smoke

**Phase 8 — Deployment:** ☐ env vars enumerated+validated ☐ migrations ordered (incl. vector cases) ☐ build green ☐ runtime smoke on real URL ☐ diagnostics reachable

**Phase 9 — Ship:** ☐ V1 scope respected ☐ known issues documented ☐ rollback stated ☐ demo rehearsed on production data ☐ acceptance criteria ticked

---

## 19 — The 10 Rules I Wish I Knew Before Starting

1. **If you cannot define "done", you are not ready to code.** Undefined done = infinite polish = unshipped.
2. **JSON is not validation.** Parseable ≠ correct. Validate schemas locally, always.
3. **A vector in a database does not mean RAG works.** Identity/status/type/language/threshold stand between it and the answer.
4. **IDs are not business state.** An existing row is not a ready entity.
5. **Mock success is not production success.** Mocks prove logic; real providers prove products.
6. **Find the first divergence, not the most suspicious code.** Instrument stages; let evidence name the layer.
7. **Every workflow needs an explicit persisted state machine** — especially with humans in the loop and multiple executions per entity.
8. **Production is another environment, not just another URL.**
9. **Not every problem belongs in V1.** Write the V2 list down and close it.
10. **Done = acceptance criteria pass in production** — not out-of-ideas, not tired.

---

## 20 — Case Studies

### Case 1 — LLM structured output failure
- **Symptom:** `Schema validation failed at "outline.0": Expected string, received object` after 3 attempts.
- **Wrong assumption:** "We send the schema, so the model follows it."
- **Investigation:** live reproduction; captured request bodies; bare `json_object` mode + null-hint prompts; identical retries.
- **Root cause:** provider contract ≠ application contract; nested types existed nowhere outside Zod.
- **Fix:** canonical Zod→JSON Schema compiler; native `json_schema` (strict when safe) with downgrade tiers; strict validation quoting paths into bounded repairs; wire-level regressions.
- **Lesson:** JSON is not validation; one canonical schema feeds provider, prompt, parser, validator.

### Case 2 — RAG vectors existed but retrieval failed
- **Symptom:** "No relevant knowledge" for everything despite published docs + 2048-d vectors.
- **Wrong assumption:** vectors exist ⇒ retrieval works.
- **Investigation:** stage-by-stage funnel; direct similarity probes with real question embeddings.
- **Root cause:** stacked causes — `draft_article/inactive` promotion bug; null/divergent embedding identities; swallowed ingestion errors; UI-language-coupled corpora.
- **Fix:** canonical promotion at publish; authoritative indexer with loud failures; funnel diagnostics endpoint; de-language-ized retrieval; integrity checks.
- **Lesson:** never debug RAG as a unit — instrument stages; "vectors exist" is never evidence.

### Case 3 — Published article stayed waiting_for_human
- **Symptom:** runs awaiting approval for already-published articles.
- **Wrong assumption:** frontend cache / wrong run updated.
- **Investigation:** approval flow finalized only `posts.agent_run_id`; regeneration creates multiple runs per post and re-points the column.
- **Root cause:** one-execution-per-entity assumption + unfinalized publish paths outside the review API.
- **Fix:** `finalizeWaitingRunsForPost()` sweeping all waiting runs by FK; wired into approve/reject/status-transition; idempotent; matrix-tested.
- **Lesson:** workflows terminate by relationship sweeps; every state-changing path shares terminal transitions.

### Case 4 — Login worked only after refresh
- **Symptom:** valid credentials + click → infinite spinner; refresh → click → success.
- **Wrong assumption:** session/middleware bug. Network tab proved POST 200 + Set-Cookie on first attempt.
- **Investigation:** divergence isolated to navigation — client router cache held unauthenticated `/admin`; `refresh()` raced `push()`.
- **Root cause:** auth-state change invisible to the client router cache.
- **Fix:** full-document navigation to sanitized internal target; spinner resolves by transition; open-redirect guard.
- **Lesson:** auth-state changes demand full navigations or explicit cache invalidation — caches don't know your cookie changed.

### Case 5 — Language switched direction but not content
- **Symptom:** FA↔EN flipped RTL/LTR instantly; text lagged/mixed.
- **Wrong assumption:** missing translations (parity was perfect: 628=628).
- **Investigation:** client dictionaries updated instantly; server components rendered under old cookie until a later request.
- **Root cause:** two render sources sharing one cookie, switcher updating only the client side.
- **Fix:** `setLocale` → `router.refresh()`; single cookie contract; parity + script-change regressions; removed a dev-only credential hint found shipping in translation bundles.
- **Lesson:** locale ≠ direction; hybrid render trees need ONE transition refreshing BOTH sides; audit bundles for dev-only strings.

### Case 6 — View Article appeared before content existed
- **Symptom:** clicking View Article during generation opened an empty shell.
- **Wrong assumption:** `postId` implies something to see (pipeline reserves an empty placeholder up-front).
- **Investigation:** API exposed nothing about readiness; DB showed `status=draft`, empty content.
- **Root cause:** action gated on identifier existence instead of business state.
- **Fix:** API exposes `postStatus`+`postHasContent`; pure `canViewArticle()` gate with 7-case matrix test; verified end-to-end by flip-to-empty-draft and restore through the admin API.
- **Lesson:** IDs are pointers, not predicates — gate actions on delivered business state.

### Case 7 — Voice settings appeared empty/fake
- **Symptom:** blank panel without a config row; with one, provider/model fields the runtime ignored.
- **Wrong assumption:** "wire the form up."
- **Investigation:** grep of consumers showed the reply pipeline reads only `ragEnabled`, `systemPrompt`, `temperature`; STT/TTS are browser Web Speech; the LLM resolves per-purpose from model config.
- **Root cause:** UI mirrored a hypothetical architecture instead of the real one; null config rendered nothing.
- **Fix:** capability-status panel (browser Web Speech, languages EN/FA, live resolved engine) + exactly the three real controls; whitelist PATCH; contract test asserting exposed key set == consumed set; defaults prevent blank panels.
- **Lesson:** settings UIs expose the intersection of user-changeable and system-consumed — everything else is fiction, enforceable by test.

---

*Built as the engineering record of AutoAI for Nature V1 — every section maps to a real commit, incident
or verification run. Freely reusable; keep the lessons, swap the war stories.*
