# KNOWN_ISSUES.md

Honest list of what does not work yet. Agents: append discoveries here.
Only features that work end-to-end appear in the README's "Done" section.

---

## Phase 0 (Initial Scaffold)

| Issue | Severity | Workaround | Owner |
|-------|----------|------------|-------|
| PDF/DOCX upload not implemented | P1 | Use text paste | Backend Agent |
| Image/visual checks not implemented | P1 | accessibility.py and visual.py return [] | Visual Agent |
| LLM-powered tone check is stubbed | P0 | Regex keyword check works for seeded data | Tone Agent |
| LLM-powered facts check is stubbed | P0 | Regex check catches planted price error | Facts Agent |
| LLM-powered claims check is stubbed | P0 | Regex catches "best in class" etc. | Claims Agent |
| Embedding similarity not tested at scale | P1 | Works for small guideline sets | Backend Agent |
| No password reset / signup flow | by design | Use demo accounts | — |
| Render free tier sleeps after 15min | by design | Frontend shows wakeup message | — |
| No file upload (images, PDF) UI | P1 | Text paste only | Frontend Agent |
| Analytics page is placeholder | P1 | Shows static cards | Frontend Agent |

---

*Agents: append new issues below this line.*

## Feature: AI Checks & Dynamic Guidelines (2026-11-07)

| Issue | Severity | Workaround | Owner |
|-------|----------|------------|-------|
| Facts grounding uses full approved fact set in prompt instead of vector retrieval | P2 (design note) | Prompt includes full approved facts set for high precision across current guideline sizes (~50-100 chunks); vector retrieval can be integrated if guidelines grow beyond context window | Facts Agent |
| In-memory LLM cache is per-process | Low | Sufficient for single-instance / development; can switch to Redis if horizontal scaling is needed | Backend Agent |
| Accessibility and visual checks remain stubs | P1 | Return `[]` as designed for current phase | Visual Agent |

---

## Feature: Review Screen & Upload (2026-11-07)

| Issue | Severity | Workaround | Owner |
|-------|----------|------------|-------|
| Image / poster visual review dropped for this round | P1 | Scoped out per hackathon priority; focus remains on text copy, PDF documents, and Word DOCX workflows | Visual Agent |
| Scanned image-only PDFs with no OCR layer cannot extract text | Low | User must copy/paste text directly or provide digital PDF with selectable text layer | Backend Agent |
| PPTX / presentation review not supported | Low | Explicitly out of scope; export presentation notes/text to DOCX or paste into review | Frontend Agent |

---

## Feature: Creator Experience (2026-11-07)

| Issue | Severity | Workaround | Owner |
|-------|----------|------------|-------|
| Original PDF/DOCX files are never modified; the Creator edits the extracted text and exports corrected text | Design note | By design: original uploaded binary files are immutable; creators edit the extracted text and export corrected text via .txt or .docx | Backend Agent |

## Feature: Reviewer Experience (2026-11-08)

| Issue | Severity | Workaround | Owner |
|-------|----------|------------|-------|
| submitted_at column added without Alembic migration; on existing DBs, a schema migration or DB reset is needed | Medium | Run `python seed/seed.py --reset` after deploying to Render/Supabase | Backend Agent |
| `nimbus-*` Tailwind class names still present in DashboardPage, SubmitPage, ReviewPage JSX (they still resolve via alias in tailwind.config.js) | Low | The brand-* aliases work correctly; a future cleanup pass can rename classes | Frontend Agent |
| Reviewer decision panel only appears on /review/:id page; there is no quick-approve action from the Approvals list page | Low | Reviewer clicks into the review to decide | Frontend Agent |
| File upload in GuidelinesPage uses POST /guidelines/upload; large files (>10 MB) return a backend 400 error that is surfaced to the user | Low | Keep guideline files under 10 MB | Frontend Agent |
