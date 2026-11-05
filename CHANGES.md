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

## Post-Deploy Fix (2026-11-05)

**Fix: Auth Login Payload & React Error #31**  
- In `frontend/src/contexts/AuthContext.jsx`, changed login request from form data (`application/x-www-form-urlencoded` with key `username`) to JSON `{ email, password }` to match the backend Pydantic `LoginRequest` contract.
- In `backend/app/models/schemas.py` and `backend/app/api/auth.py`, updated `LoginRequest` to accept either `email` or `username` so both calling conventions succeed.
- Created `getErrorMessage()` in `frontend/src/api/client.js` to safely normalize FastAPI validation errors (`detail` array of `{type, loc, msg, input}`) into human-readable strings, eliminating React Minified Error #31.
- Updated `ReviewCreate` and `ApprovalCreate` to be resilient to client field aliases (`content` vs `content_text`, `decision` vs `action`).
- Removed the footer `© 2026 Nimbus Bank — Internal Brand Governance Tool` from `LoginPage.jsx`.
