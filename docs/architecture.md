# Architecture â€” BrandGuard AI

## System Overview

```
                    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                    â”‚         Vercel (Frontend)        â”‚
                    â”‚   React + Vite + Tailwind CSS    â”‚
                    â”‚                                  â”‚
                    â”‚  Login â†’ Dashboard â†’ Review UI   â”‚
                    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                   â”‚ HTTPS REST
                    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                    â”‚         Render (Backend)         â”‚
                    â”‚       FastAPI + Python           â”‚
                    â”‚                                  â”‚
                    â”‚  /api/auth  /api/reviews         â”‚
                    â”‚  /api/guidelines /api/approvals  â”‚
                    â”‚  /api/audit                      â”‚
                    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”          â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”
              â”‚  Supabase   â”‚          â”‚  Gemini API    â”‚
              â”‚  Postgres   â”‚          â”‚  (Google)      â”‚
              â”‚  (prod)     â”‚          â”‚  LLM + Embed   â”‚
              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜          â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
              SQLite (local dev)
```

---

## Backend Module Structure

```
backend/
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ main.py              # FastAPI app, routers, CORS, startup
â”‚   â”œâ”€â”€ config.py            # pydantic-settings (env vars)
â”‚   â”œâ”€â”€ database.py          # SQLAlchemy engine + session
â”‚   â”œâ”€â”€ dependencies.py      # JWT auth dependency, role guards
â”‚   â”œâ”€â”€ models/
â”‚   â”‚   â”œâ”€â”€ db.py            # SQLAlchemy ORM models
â”‚   â”‚   â””â”€â”€ schemas.py       # Pydantic schemas (Issue is defined here)
â”‚   â”œâ”€â”€ api/
â”‚   â”‚   â”œâ”€â”€ auth.py          # POST /auth/login
â”‚   â”‚   â”œâ”€â”€ reviews.py       # Reviews CRUD + submit + issue updates
â”‚   â”‚   â”œâ”€â”€ guidelines.py    # Guideline docs upload/list
â”‚   â”‚   â”œâ”€â”€ approvals.py     # Approval workflow
â”‚   â”‚   â””â”€â”€ audit.py         # Audit log
â”‚   â”œâ”€â”€ checks/
â”‚   â”‚   â”œâ”€â”€ tone.py          # Brand voice/tone check (P0)
â”‚   â”‚   â”œâ”€â”€ facts.py         # Fact verification against approved facts (P0)
â”‚   â”‚   â”œâ”€â”€ claims.py        # Superlative claim detection (P0)
â”‚   â”‚   â”œâ”€â”€ accessibility.py # WCAG/readability (P1 stub)
â”‚   â”‚   â”œâ”€â”€ visual.py        # Visual/palette check (P1 stub)
â”‚   â”‚   â””â”€â”€ orchestrator.py  # Runs all checks in parallel
â”‚   â”œâ”€â”€ llm/
â”‚   â”‚   â””â”€â”€ provider.py      # ONLY file that imports google-generativeai
â”‚   â””â”€â”€ services/
â”‚       â”œâ”€â”€ review_service.py    # Orchestrates checks, saves issues
â”‚       â”œâ”€â”€ embedding_service.py # Chunk + embed + cosine similarity
â”‚       â””â”€â”€ audit_service.py     # Audit log helper
â”œâ”€â”€ seed/
â”‚   â””â”€â”€ seed.py              # Idempotent seed: users and demo data
â””â”€â”€ tests/
    â””â”€â”€ test_checks.py       # Proves checks catch planted issues
```

---

## Data Model

```
User â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
  id, email, hashed_password, role     â”‚
  full_name, is_active                 â”‚
                                       â”‚
GuidelineDoc â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
  id, title, doc_type              â”‚   â”‚
  content_text                     â”‚   â”‚
  created_by (FK User)             â”‚   â”‚
                â”‚                  â”‚   â”‚
                â–¼                  â”‚   â”‚
          GuidelineChunk           â”‚   â”‚
            id, doc_id (FK)        â”‚   â”‚
            chunk_text             â”‚   â”‚
            chunk_index            â”‚   â”‚
            embedding_json         â”‚   â”‚
                                   â”‚   â”‚
Review â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
  id, title, content_text              â”‚
  content_type, status                 â”‚
  submitted_by (FK User) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
          â”‚
          â”œâ”€â”€â–º Issue[]
          â”‚     id, review_id (FK)
          â”‚     category, severity
          â”‚     location_{start,end,region}
          â”‚     message, evidence_*, suggestion
          â”‚     status
          â”‚
          â””â”€â”€â–º Approval[]
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
         â”‚
         â–¼
   review_service.run_checks()
         â”‚
         â”œâ”€â”€ embedding_service.find_similar_chunks(content)
         â”‚   â””â”€â”€ Returns relevant guideline/fact context
         â”‚
         â–¼
   orchestrator.run_all(content, context)
         â”‚
         â”œâ”€â”€ asyncio.gather(
         â”‚     tone.run(),         # catches casual language
         â”‚     facts.run(),        # checks facts vs approved facts
         â”‚     claims.run(),       # detects unsubstantiated claims
         â”‚     accessibility.run(), # (P1 stub â†’ [])
         â”‚     visual.run()         # (P1 stub â†’ [])
         â”‚   )
         â”‚   Each wrapped in try/except â†’ [] on failure
         â”‚
         â–¼
   Merge & save issues to DB
   Log to AuditLog
         â”‚
         â–¼
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

If `GEMINI_API_KEY` is empty â†’ stubs return:
- `generate_json` â†’ `{}`  
- `generate_text` â†’ `"stub"`  
- `embed` â†’ list of 768 zeros  
- `analyze_image` â†’ `{}`

This means the **entire app runs locally without any API keys**.

---

## Auth Flow

```
POST /auth/login {email, password}
        â”‚
        â–¼
   bcrypt verify password
        â”‚
        â–¼
   JWT {sub: user.id, email, role, full_name}
   expires in 8 hours
        â”‚
        â–¼
   Frontend stores in localStorage("bg_token")
   Sends as Authorization: Bearer <token>
        â”‚
        â–¼
   Backend dependency: get_current_user(token) -> User
   Role guard: require_role("reviewer") -> 403 if not
```

---

## Embedding / RAG (No Vector DB)

1. Guideline text is chunked into ~500-char pieces
2. Each chunk is embedded via `provider.embed([chunk_text])` â†’ `list[float]`
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

| Action | Creator | Reviewer |
|--------|---------|----------|
| Submit content | ✓ | ✗ |
| View own reviews | ✓ | ✓ |
| View all reviews | ✗ | ✓ |
| Accept/dismiss issues | ✗ | ✓ |
| Approve/reject review | ✗ | ✓ |
| Read guidelines | ✓ | ✓ |

---

*Architecture version: 1.0 â€” Phase 0*

