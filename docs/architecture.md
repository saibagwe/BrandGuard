# Architecture — BrandGuard AI

## System Overview

```
                    ┌─────────────────────────────────┐
                    │         Vercel (Frontend)        │
                    │   React + Vite + Tailwind CSS    │
                    │                                  │
                    │  Login → Dashboard → Review UI   │
                    └──────────────┬──────────────────┘
                                   │ HTTPS REST
                    ┌──────────────▼──────────────────┐
                    │         Render (Backend)         │
                    │       FastAPI + Python           │
                    │                                  │
                    │  /api/auth  /api/reviews         │
                    │  /api/guidelines /api/approvals  │
                    │  /api/audit                      │
                    └──────────────┬──────────────────┘
                         ┌─────────┴──────────┐
              ┌──────────▼──┐          ┌───────▼────────┐
              │  Supabase   │          │  Gemini API    │
              │  Postgres   │          │  (Google)      │
              │  (prod)     │          │  LLM + Embed   │
              └─────────────┘          └────────────────┘
              SQLite (local dev)
```

---

## Backend Module Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app, routers, CORS, startup
│   ├── config.py            # pydantic-settings (env vars)
│   ├── database.py          # SQLAlchemy engine + session
│   ├── dependencies.py      # JWT auth dependency, role guards
│   ├── models/
│   │   ├── db.py            # SQLAlchemy ORM models
│   │   └── schemas.py       # Pydantic schemas (Issue is defined here)
│   ├── api/
│   │   ├── auth.py          # POST /auth/login
│   │   ├── reviews.py       # Reviews CRUD + submit + issue updates
│   │   ├── guidelines.py    # Guideline docs upload/list
│   │   ├── approvals.py     # Approval workflow
│   │   └── audit.py         # Audit log
│   ├── checks/
│   │   ├── tone.py          # Brand voice/tone check (P0)
│   │   ├── facts.py         # Fact verification against approved facts (P0)
│   │   ├── claims.py        # Superlative claim detection (P0)
│   │   ├── accessibility.py # WCAG/readability (P1 stub)
│   │   ├── visual.py        # Visual/palette check (P1 stub)
│   │   └── orchestrator.py  # Runs all checks in parallel
│   ├── llm/
│   │   └── provider.py      # ONLY file that imports google-generativeai
│   └── services/
│       ├── review_service.py    # Orchestrates checks, saves issues
│       ├── embedding_service.py # Chunk + embed + cosine similarity
│       └── audit_service.py     # Audit log helper
├── seed/
│   └── seed.py              # Idempotent seed: users, Nimbus Bank data
└── tests/
    └── test_checks.py       # Proves checks catch planted issues
```

---

## Data Model

```
User ──────────────────────────────────┐
  id, email, hashed_password, role     │
  full_name, is_active                 │
                                       │
GuidelineDoc ──────────────────────┐   │
  id, title, doc_type              │   │
  content_text                     │   │
  created_by (FK User)             │   │
                │                  │   │
                ▼                  │   │
          GuidelineChunk           │   │
            id, doc_id (FK)        │   │
            chunk_text             │   │
            chunk_index            │   │
            embedding_json         │   │
                                   │   │
Review ────────────────────────────┘   │
  id, title, content_text              │
  content_type, status                 │
  submitted_by (FK User) ─────────────┘
          │
          ├──► Issue[]
          │     id, review_id (FK)
          │     category, severity
          │     location_{start,end,region}
          │     message, evidence_*, suggestion
          │     status
          │
          └──► Approval[]
                id, review_id (FK)
                approved_by (FK User)
                action, comment

AuditLog
  id, actor_id (FK User, nullable)
  action, resource_type, resource_id
  detail, created_at
```

---

## Check Pipeline

```
POST /reviews/{id}/submit
         │
         ▼
   review_service.run_checks()
         │
         ├── embedding_service.find_similar_chunks(content)
         │   └── Returns relevant guideline/fact context
         │
         ▼
   orchestrator.run_all(content, context)
         │
         ├── asyncio.gather(
         │     tone.run(),         # catches casual language
         │     facts.run(),        # checks facts vs approved facts
         │     claims.run(),       # detects unsubstantiated claims
         │     accessibility.run(), # (P1 stub → [])
         │     visual.run()         # (P1 stub → [])
         │   )
         │   Each wrapped in try/except → [] on failure
         │
         ▼
   Merge & save issues to DB
   Log to AuditLog
         │
         ▼
   Return ReviewOut with issues
```

---

## LLM Provider (Isolation)

**Only `backend/app/llm/provider.py` imports `google.generativeai`.**

```python
# provider.py interface:
generate_json(prompt: str, schema: dict) -> dict
generate_text(prompt: str) -> str
embed(texts: list[str]) -> list[list[float]]
analyze_image(image_bytes: bytes, prompt: str, schema: dict) -> dict
```

If `GEMINI_API_KEY` is empty → stubs return:
- `generate_json` → `{}`  
- `generate_text` → `"stub"`  
- `embed` → list of 768 zeros  
- `analyze_image` → `{}`

This means the **entire app runs locally without any API keys**.

---

## Auth Flow

```
POST /auth/login {email, password}
        │
        ▼
   bcrypt verify password
        │
        ▼
   JWT {sub: user.id, email, role, full_name}
   expires in 8 hours
        │
        ▼
   Frontend stores in localStorage("bg_token")
   Sends as Authorization: Bearer <token>
        │
        ▼
   Backend dependency: get_current_user(token) -> User
   Role guard: require_role("manager", "reviewer") -> 403 if not
```

---

## Embedding / RAG (No Vector DB)

1. Guideline text is chunked into ~500-char pieces
2. Each chunk is embedded via `provider.embed([chunk_text])` → `list[float]`
3. Stored as JSON in `GuidelineChunk.embedding_json` (Postgres Text column)
4. At review time: embed the content, cosine-similarity with all chunk embeddings (numpy), return top-k
5. Those chunks form the `context` passed to check modules

**No pgvector, no external vector DB needed.**

---

## Deployment

| Component | Platform | Sleep behavior |
|-----------|----------|----------------|
| Frontend | Vercel | Always on |
| Backend API | Render (free) | Sleeps after 15min inactivity |
| Database | Supabase | Always on |

Frontend shows "Server is waking up..." state when backend is sleeping.  
Render free tier takes 30-60s to wake from sleep.

---

## Roles & Permissions

| Action | Creator | Manager | Reviewer | Admin |
|--------|---------|---------|----------|-------|
| Submit content | ✓ | ✓ | ✗ | ✗ |
| View own reviews | ✓ | ✓ | ✓ | ✓ |
| View all reviews | ✗ | ✓ | ✓ | ✓ |
| Accept/dismiss issues | ✗ | ✓ | ✓ | ✗ |
| Approve/reject review | ✗ | ✓ | ✓ | ✗ |
| Upload guidelines | ✗ | ✗ | ✗ | ✓ |
| View audit log | ✗ | ✗ | ✗ | ✓ |

---

*Architecture version: 1.0 — Phase 0*
