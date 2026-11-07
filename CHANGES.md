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

---

## Feature: AI Checks & Dynamic Guidelines (2026-11-07)

**Upgrade: Tone, Facts, and Claims Checks Upgraded to LLM**
- Upgraded `backend/app/checks/tone.py` to use `llm.generate_json` with brand voice guidelines and terminology rules from `context`, flagging casual tone, slang, banned words, and exclamation overuse, while keeping deterministic regex terminology as a baseline and fallback. Merges without duplicates.
- Upgraded `backend/app/checks/facts.py` to use `llm.generate_json` against the full approved facts from `context`, extracting checkable statements and returning contradicted/outdated statements (HIGH severity, evidence quoting approved fact and source doc) and unverifiable statements (MEDIUM severity, null evidence, message indicating no approved source found).
- Upgraded `backend/app/checks/claims.py` with keyword pre-filter ("best", "#1", "world-class", "fastest", "guaranteed", unqualified comparisons) and LLM substantiation verification against approved documents; emits HIGH severity claim issue with compliant rewrite when unsubstantiated, and leaves substantiated claims unflagged.
- Added in-memory caching with 5-minute TTL keyed by SHA256 of `(check_name, content, context_version)` to prevent duplicate LLM calls and conserve quota.
- Added graceful fallback to regex/stub checks on 429 quota exhaustion and unexpected errors.
- Strict Pydantic validation on all LLM responses with 1 automatic retry on invalid schema.
- Added code-computed exact `{start, end}` location matching with case-insensitive fallback (never trusting LLM offsets).

**Enhancement: Admin Guidelines CRUD & Dynamic Review Context**
- Extended `backend/app/api/guidelines.py` to support full Admin CRUD (POST, GET, PUT/PATCH, DELETE) with `require_role("admin")`.
- Supports document types `voice` (`brand-voice`), `terminology`, `facts` (`approved-facts`), and `visual`.
- Added automatic re-chunking/embedding and audit logging (`create`, `update`, `delete`) on every guideline change.
- In `backend/app/checks/orchestrator.py`, added `build_context_from_db(db, review_id, review_title)` so reviews dynamically fetch latest guidelines from the database (falling back to seeded Nimbus Bank defaults).
- Updated `backend/app/services/review_service.py` so the NEXT review immediately incorporates created, updated, or deleted guidelines.
- Updated `frontend/src/pages/GuidelinesPage.jsx` with full Admin Edit (modal/inline form) and Delete (with confirmation) workflows.

**API: GET /api/status Endpoint**
- Added `/api/status` endpoint to report DB reachability and whether an LLM key is configured, exposing no secrets.

---

## Feature: Interactive Review Screen & File Upload (2026-11-07)

**Feature: Multipart Document Upload (PDF, DOCX, Text)**
- Added `backend/app/services/file_extraction.py` supporting text extraction from PDF (PyMuPDF) and Word DOCX (python-docx), with plain-text fallback.
- Added file size limit of 10 MB, with explicit error handling for empty files, oversized files, scanned PDFs with no selectable text, and unsupported extensions (e.g. PPTX, XLSX, images).
- Implemented `POST /api/reviews/upload` multipart endpoint in `backend/app/api/reviews.py` to upload, extract text, store filename and content type, and trigger the AI check pipeline in a single step.
- Added sample seed documents (`backend/seed/sample.pdf`, `backend/seed/sample.docx`) and comprehensive unit tests (`backend/tests/test_file_extraction.py`).
- Enhanced `frontend/src/pages/SubmitPage.jsx` with a tabbed interface allowing users to either paste text or upload PDF/DOCX/TXT files via drag-and-drop or file picker, displaying file metadata and progress states.

**Feature: Interactive Review Screen & Span Highlighting**
- Upgraded `frontend/src/pages/ReviewPage.jsx` with an interactive text highlight engine that maps issues to character offsets `{start, end}` with severity colors, underlines, and accessible labels.
- Safely handles overlapping highlight spans by prioritizing higher severity issues and renders null-location issues in the issue sidebar list only.
- Two-way scroll and focus navigation: clicking an issue card highlights and scrolls to its corresponding span in the document; clicking a highlighted span scrolls to and focuses the issue card.
- Comprehensive issue card actions: Accept (applies fix to document and adjusts downstream character offsets), Edit (user customizes replacement text before applying), and Dismiss (hides the issue).
- Added summary bar with interactive filter chips by severity (High, Med, Low) and category (Tone, Fact, Claim, etc.), plus a toggle to view/hide dismissed issues.
- Added responsive design that stacks columns on mobile screens and presents side-by-side on desktop.
- Added "Submit for approval" workflow: available immediately when 0 HIGH issues are open, or displays a warning with an explicit confirmation step when HIGH issues remain.
