# AGENTS.md — Multi-Agent Collaboration Guide

> **Read this before touching any code.**  
> This document is the source of truth for how agents (human or AI) collaborate on BrandGuard AI.

---

## 1. Before Starting Any Task

```bash
git pull origin main
# Read this file, docs/issue-schema.md, docs/api.md
# Check KNOWN_ISSUES.md for blockers
# Check CHANGES.md for recent decisions
```

---

## 2. Branching & Commit Convention

| Rule | Detail |
|------|--------|
| Branch name | `feature/<short-name>` (e.g. `feature/tone-check`) |
| Commit prefix | `feat:`, `fix:`, `chore:`, `docs:` |
| Merge to main | Only when the feature **runs end-to-end** |
| main is always deployable | Never push broken code to main |

```bash
git checkout -b feature/my-task
git add -p          # stage carefully
git commit -m "feat: implement tone check with LLM"
git push origin feature/my-task
# Open PR → review → merge
```

---

## 3. Module Ownership Map

Each agent/teammate owns specific files. **Do NOT edit files outside your module** without coordinating.

| Module | Files Owned | Owner |
|--------|-------------|-------|
| Auth & Users | `backend/app/api/auth.py`, `backend/app/models/db.py` (User) | Backend Agent |
| Issue Schema | `backend/app/models/schemas.py`, `docs/issue-schema.md` | Schema Owner (coordinate with ALL) |
| Tone Check | `backend/app/checks/tone.py` | Tone Agent |
| Facts Check | `backend/app/checks/facts.py` | Facts Agent |
| Claims Check | `backend/app/checks/claims.py` | Claims Agent |
| Accessibility Check | `backend/app/checks/accessibility.py` | A11y Agent |
| Visual Check | `backend/app/checks/visual.py` | Visual Agent |
| LLM Provider | `backend/app/llm/provider.py` | LLM Agent (do NOT edit without updating docs) |
| Embedding Service | `backend/app/services/embedding_service.py` | Backend Agent |
| Review Orchestrator | `backend/app/checks/orchestrator.py`, `backend/app/services/review_service.py` | Backend Agent |
| Frontend Auth/Layout | `frontend/src/contexts/`, `frontend/src/components/Layout.jsx` | Frontend Agent |
| Review Screen | `frontend/src/pages/ReviewPage.jsx` | Frontend Agent |
| Dashboard/Submit | `frontend/src/pages/DashboardPage.jsx`, `frontend/src/pages/SubmitPage.jsx` | Frontend Agent |
| Seed Data | `backend/seed/seed.py` | Seed Agent |
| Docs | `docs/`, `README.md`, `CHANGES.md`, `KNOWN_ISSUES.md` | All (append only) |

---

## 4. The Issue Schema — NEVER Break Compatibility

The `Issue` Pydantic model in `backend/app/models/schemas.py` and the TypeScript type in `frontend/src/types/issue.ts` **must stay in sync**.

> **Any change to Issue fields requires**:  
> 1. Update `backend/app/models/schemas.py`  
> 2. Update `frontend/src/types/issue.ts`  
> 3. Update `docs/issue-schema.md`  
> 4. Mention in commit message: `"schema: add X field to Issue"`

---

## 5. Adding a Check Module

Each check module in `backend/app/checks/` must:

1. Expose exactly: `def run(content: str, context: dict) -> list[Issue]`
2. Never crash — catch exceptions internally and return `[]` on failure
3. Ship with a test in `backend/tests/` that proves it catches issues from provided guidelines
4. Work with **no LLM** (stub mode) for local dev

```python
# Template: backend/app/checks/my_check.py
from app.models.schemas import Issue
import uuid

def run(content: str, context: dict) -> list[Issue]:
    """
    Args:
        content: The text content to check
        context: {
            "facts": list[str],        # approved fact strings
            "terminology": list[str],  # rules
            "voice_guide": str,        # brand voice guidelines
            "review_id": str           # UUID of the review
        }
    Returns: list[Issue]
    """
    issues = []
    # ... your logic ...
    return issues
```

---

## 6. API Contract

> Read `docs/api.md` for full endpoint specs.  
> Do NOT add endpoints without updating `docs/api.md`.

---

## 7. Environment & Secrets

- Secrets go in `.env` (gitignored). See `.env.example`.
- Backend reads config from `backend/app/config.py` (pydantic-settings).
- Frontend reads from `VITE_*` env vars.
- If `GEMINI_API_KEY` is missing → LLM provider returns stubs → app still works.

---

## 8. After Finishing Your Task

1. Append to `CHANGES.md`: what you changed and why.
2. Append to `KNOWN_ISSUES.md`: what doesn't work yet.
3. Update `docs/api.md` if you added/changed endpoints.
4. Ensure `python -m pytest backend/tests/` passes (or note failures in KNOWN_ISSUES).
5. Merge to main only when your feature is **running end-to-end**.

---

## 9. Deployment

| Service | Platform | Config File |
|---------|----------|-------------|
| Backend API | Render (free tier) | `backend/render.yaml` |
| Frontend | Vercel | `frontend/vercel.json` |
| Database | Supabase Postgres | Set `DATABASE_URL` env var |

See `README.md` for step-by-step deploy instructions.

---

## 10. Demo Credentials (all use password: `demo1234`)

| Email | Role | Can do |
|-------|------|--------|
| creator@brandguard.ai | Creator | Submit content |
| manager@brandguard.ai | Manager | Submit + review + approve |
| reviewer@brandguard.ai | Reviewer | Review + approve |
| admin@brandguard.ai | Admin | Manage guidelines |

---

*Last updated: 2026-11-07*
