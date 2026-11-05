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
