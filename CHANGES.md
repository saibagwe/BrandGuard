# CHANGES.md

All significant decisions and deviations from the original proposal are logged here.
Agents: append entries chronologically. Never delete entries.

---

## Phase 0 — Initial Scaffold (2026-11-05)

**Decision: SQLite for local dev, Postgres for prod**  
Using `DATABASE_URL` env var as the toggle. Empty = SQLite at `./brandguard.db`. This means zero setup for local development.

**Decision: JWT expiry set to 8 hours**  
Long enough for a hackathon demo session without annoying re-logins.

**Decision: Embedding stored as JSON text in Postgres**  
No pgvector, no external vector DB. Cosine similarity computed with numpy in Python. Good enough for the volume of guideline chunks we'll have (~50-100 chunks). Can upgrade later.

**Decision: Check stubs return planted issues deterministically**  
Tone, facts, and claims checks are implemented as deterministic Python regex/keyword logic (no LLM) in Phase 0. This means they work without a Gemini API key. LLM enhancement is a Phase 1 task.

**Decision: Single-step approval only**  
No multi-level approval chains. Manager OR Reviewer can approve. Keeps the review flow simple for the hackathon.

**Decision: /reviews/sample endpoint requires no auth**  
Allows frontend to be built and tested independently of auth. This endpoint returns a hardcoded review JSON.

**Decision: PDF/DOCX upload is P1**  
Phase 0 supports text paste only. PDF/DOCX parsing (PyMuPDF, python-docx) is stubbed but not wired to the UI.

**Decision: Vercel + Render for deployment**  
Both free tier. Render backend sleeps, so frontend shows a friendly wakeup message.

---

*Agents: append your changes below this line.*
