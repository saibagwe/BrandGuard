# API Reference — BrandGuard AI

Base URL: `https://<your-render-app>.onrender.com/api`  
Local: `http://localhost:8000/api`

All authenticated endpoints require `Authorization: Bearer <token>` header.

---

## Authentication

### POST /auth/login
No auth required. Only active accounts with `creator` or `reviewer` roles can authenticate.

**Request:**
```json
{ "email": "creator@nimbus.bank", "password": "demo1234" }
```

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "creator@nimbus.bank",
    "role": "creator",
    "full_name": "Alex Creator"
  }
}
```

**Errors:** 401 invalid credentials, 403 role no longer supported or account disabled

---

## Health & Status

### GET /health
No auth. Returns `{"status": "ok", "version": "0.1.0"}`.

### GET /api/status
No auth. Reports database connectivity and whether LLM key is configured (contains no secrets).  
**Response 200:**
```json
{
  "status": "ok",
  "llm_key_configured": true,
  "db_reachable": true
}
```

---

## Reviews

### POST /reviews
**Auth:** Creator, Reviewer  
**Request:**
```json
{ "title": "My Campaign", "content_text": "...", "content_type": "text" }
```
**Response 201:** ReviewOut (see schema below)

---

### GET /reviews
**Auth:** Creator, Reviewer  
Creators see own reviews. Reviewers see all in_review+.  
**Response 200:** `[ReviewOut]`

---

### GET /reviews/{id}
**Auth:** Creator (own review), Reviewer  
**Response 200:** ReviewOut with full issue list

---

### GET /reviews/sample
**Auth:** None (public, for frontend dev)  
Returns hardcoded sample review (Nimbus Bank Summer Campaign with 3 planted issues).

---

### POST /reviews/{id}/submit
**Auth:** Creator (own review)  
Triggers AI checks. Changes status from `draft` to `in_review`.  
**Response 200:** ReviewOut with issues populated

---

### POST /reviews/upload
**Auth:** Creator, Reviewer  
**Content-Type:** `multipart/form-data`  
**Query params:** `title` (string, required)  
**Form fields:** `file` (binary — PDF, DOCX, or TXT, max 10 MB)

Extracts text from the uploaded file, creates a review, runs AI checks in one step, returns ReviewOut.

**Supported:** `.pdf` (selectable-text only), `.docx`, `.txt` / `.md`

**Errors:** 400 — empty file, >10 MB, unsupported type, scanned PDF with no text, corrupt file

**Response 201:** ReviewOut (status = `in_review`, issues populated)

---

### PATCH /reviews/{id}/issues/{issue_id}
**Auth:** Reviewer  
**Request:**
```json
{
  "status": "accepted" | "edited" | "dismissed",
  "edited_suggestion": "optional new suggestion text"
}
```
**Response 200:** Updated Issue

---

## Approvals

### POST /reviews/{id}/approve
**Auth:** Reviewer  
**Request:**
```json
{
  "action": "approved" | "changes_requested",
  "comment": "optional comment"
}
```
**Response 200:** ApprovalOut

---

### GET /approvals
**Auth:** Reviewer  
Returns reviews in `in_review` status needing approval.  
**Response 200:** `[ReviewOut]`

---

## Guidelines

### GET /guidelines
**Auth:** Creator, Reviewer  
**Response 200:** `[GuidelineDocOut]`

---

### GET /guidelines/{id}
**Auth:** Creator, Reviewer  
**Response 200:** GuidelineDocOut with chunk_count

---

## Schemas

### ReviewOut
```json
{
  "id": "uuid",
  "title": "string",
  "content_text": "string",
  "content_type": "text|pdf|docx",
  "status": "draft|in_review|changes_requested|approved",
  "submitted_by": "uuid",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "issues": [Issue]
}
```

### GuidelineDocOut
```json
{
  "id": "uuid",
  "title": "string",
  "doc_type": "voice|terminology|facts|visual",
  "created_by": "uuid|null",
  "created_at": "ISO8601",
  "chunks_count": 0
}
```

### ApprovalOut
```json
{
  "id": "uuid",
  "review_id": "uuid",
  "approved_by": "uuid",
  "action": "approved|changes_requested",
  "comment": "string|null",
  "created_at": "ISO8601"
}
```

### Issue
See [docs/issue-schema.md](./issue-schema.md).

---

## Error Format

```json
{ "detail": "Human-readable error message" }
```

HTTP status codes: 400 (bad request), 401 (not authenticated), 403 (forbidden), 404 (not found), 422 (validation error), 500 (server error).
