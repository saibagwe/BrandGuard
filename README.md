# BrandGuard AI

> AI-powered brand governance platform. Review content against approved guidelines before publication.

**Live Demo:** [frontend-url] | **API:** [backend-url]

> Login with the demo buttons on the login page — no account needed.

---

## What Works (Phase 0)

- ✅ Demo login (4 roles: Creator, Manager, Reviewer, Admin)
- ✅ Submit text content for brand review
- ✅ AI checks: tone (casual language), facts (incorrect prices/dates), claims (superlative claims)
- ✅ Issue display with severity, explanation, evidence, and suggested fix
- ✅ Accept / dismiss issues
- ✅ Approval workflow (Manager/Reviewer can approve)
- ✅ Audit log
- ✅ Guidelines admin (upload new guidelines)
- ✅ Seeded Nimbus Bank demo data with 3 planted-issue reviews

## What's Coming (P1)

- 🔲 PDF/DOCX file upload
- 🔲 Image visual checks (palette, contrast)
- 🔲 Accessibility readability checks
- 🔲 LLM-powered tone/facts checks (regex stubs exist now)
- 🔲 Analytics dashboard

---

## Demo Credentials

All use password: **`demo1234`**

| Role | Email | Access |
|------|-------|--------|
| Creator | creator@nimbus.bank | Submit content |
| Manager | manager@nimbus.bank | Review + approve |
| Reviewer | reviewer@nimbus.bank | Review + approve |
| Admin | admin@nimbus.bank | Manage guidelines |

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+

### Backend

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Copy env example (no secrets needed for local dev)
cp ../.env.example .env

# Seed demo data
python seed/seed.py

# Start server
uvicorn app.main:app --reload
# → http://localhost:8000
# → http://localhost:8000/health (verify working)
# → http://localhost:8000/docs (Swagger UI)
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy env example
cp .env.example .env
# Edit .env: VITE_API_URL=http://localhost:8000/api

# Start dev server
npm run dev
# → http://localhost:5173
```

---

## Deployment

### Backend → Render

1. Create account at [render.com](https://render.com)
2. New → Web Service → Connect GitHub repo
3. **Root Directory:** `backend`
4. **Build Command:** `pip install -r requirements.txt`
5. **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Set environment variables:
   - `DATABASE_URL` → your Supabase Postgres connection string
   - `GEMINI_API_KEY` → your Google Gemini API key
   - `JWT_SECRET` → random 32+ char string (run: `openssl rand -hex 32`)
   - `LLM_MODEL` → `gemini-1.5-flash`
   - `VISION_MODEL` → `gemini-1.5-flash`
   - `EMBED_MODEL` → `models/text-embedding-004`
   - `CORS_ORIGINS` → your Vercel frontend URL
7. Deploy. After first deploy, go to Shell tab and run: `python seed/seed.py`

### Database → Supabase

1. Create account at [supabase.com](https://supabase.com)
2. New project → wait for provisioning
3. Settings → Database → Copy the **Connection String** (URI format)
4. Set as `DATABASE_URL` in Render env vars

### Frontend → Vercel

1. Create account at [vercel.com](https://vercel.com)
2. New Project → Import GitHub repo
3. **Framework:** Vite
4. **Root Directory:** `frontend`
5. Set environment variables:
   - `VITE_API_URL` → `https://your-render-app.onrender.com/api`
6. Deploy

> **Note:** Render free tier sleeps after 15 minutes of inactivity. The frontend shows a "Server is waking up..." message during cold starts (30-60s).

---

## Project Structure

```
BrandGuard/
├── frontend/           # React + Vite + Tailwind
├── backend/            # FastAPI + Python
│   ├── app/
│   │   ├── api/        # Route handlers
│   │   ├── checks/     # Brand check modules
│   │   ├── llm/        # Gemini provider (isolated)
│   │   ├── models/     # DB + Pydantic schemas
│   │   └── services/   # Business logic
│   └── seed/           # Demo data seed script
├── docs/               # Architecture, API, Issue schema
├── AGENTS.md           # Multi-agent collaboration guide
├── CHANGES.md          # Decision log
└── KNOWN_ISSUES.md     # What doesn't work yet
```

---

## For AI Agents / Teammates

**Start here:** Read [AGENTS.md](./AGENTS.md), then [docs/issue-schema.md](./docs/issue-schema.md) and [docs/api.md](./docs/api.md).

Each check module lives in `backend/app/checks/` and must implement:
```python
def run(content: str, context: dict) -> list[Issue]:
    ...
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS, React Router v6, Recharts |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0 |
| Database | Supabase Postgres (prod) / SQLite (local) |
| LLM | Google Gemini 1.5 Flash |
| Embeddings | Gemini text-embedding-004 + numpy cosine similarity |
| Auth | JWT (python-jose) with bcrypt passwords |
| Deployment | Vercel (frontend) + Render (backend) |


---

## Creator Flow

A 5-step walkthrough of the Creator experience in BrandGuard AI:

1. **Submit Content**: Navigate to "New Review" (`/submit`), enter a title, and either paste raw text or upload a single document file (PDF, DOCX, or TXT). The app strictly enforces the "one text or one file" rule and validates file size (max 10 MB).
2. **Automated AI Checking**: Review status transitions to `checking`. The Creator workspace displays real-time per-check progress (Tone, Facts, Claims, Accessibility, Visual) polling the backend until status reaches `ready`.
3. **Interactive Review & Targeted Fixes**: Explore the two-column workspace. Click any highlighted text span to inspect its linked issue card, or click a card to focus its text span. Apply targeted fixes with **Accept**, customize replacements with **Edit**, or **Dismiss** an issue with an optional reason.
4. **Edit Content & Re-Check**: Need broader revisions? Switch to "Edit text" mode to edit directly inside the workspace. Saving increments `content_version` and marks the report stale. Trigger **Re-check** at any time: new issues are generated, and previously dismissed issues are preserved.
5. **Submit for Approval & Export**: Submit the review for approval. If edits were made without re-checking, the app alerts you to re-check. If high-severity issues remain open, explicit confirmation is required. Once approved by a Reviewer, the content locks and offers **Copy text**, **Download .txt**, and **Download .docx**.
