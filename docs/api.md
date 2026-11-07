# API Reference — BrandGuard AI

Base URL: `https://<your-render-app>.onrender.com/api`  
Local: `http://localhost:8000/api`

All authenticated endpoints require `Authorization: Bearer <token>` header.

---

## Authentication

### POST /auth/login
No auth required.

**Request:**
```json
{ "email": "creator@brandguard.ai", "password": "demo1234" }
```

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "creator@brandguard.ai",
    "role": "creator",
    "full_name": "Alex Creator"
  }
}
```

**Errors:** 401 invalid credentials

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
**Auth:** Creator, Manager  
**Request:**
```json
{ "title": "My Campaign", "content_text": "...", "content_type": "text" }
```
**Response 201:** ReviewOut (see schema below)

---

### GET /reviews
**Auth:** Any role  
Creators see own reviews. Managers/Reviewers see all in_review+.  
**Response 200:** `{ "reviews": [ReviewOut], "total": int }`

---

### GET /reviews/{id}
**Auth:** Any role  
**Response 200:** ReviewOut with full issue list

---

### GET /reviews/sample
**Auth:** None (public, for frontend dev)  
Returns neutral sample review placeholder.

---

### POST /reviews/{id}/submit
**Auth:** Creator (own review), Manager  
Triggers AI checks. Changes status from `draft` to `in_review`.  
**Response 200:** ReviewOut with issues populated

---

### PATCH /reviews/{id}/issues/{issue_id}
**Auth:** Manager, Reviewer  
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
**Auth:** Manager, Reviewer  
**Request:**
```json
{
  "action": "approved" | "changes_requested",
  "comment": "optional comment"
}
```
**Response 200:**
```json
{ "approval_id": "uuid", "review_status": "approved" | "changes_requested" }
```

---

### GET /approvals
**Auth:** Manager, Reviewer  
Returns reviews in `in_review` status needing approval.  
**Response 200:** `{ "reviews": [ReviewOut] }`

---

## Guidelines

### POST /guidelines
**Auth:** Admin  
**Request:**
```json
{
  "title": "Brand Voice Guide",
  "doc_type": "voice" | "terminology" | "facts" | "visual",
  "content_text": "Full text of the guideline..."
}
```
**Response 201:** GuidelineDocOut

---

### GET /guidelines
**Auth:** Any role  
**Response 200:** `{ "docs": [GuidelineDocOut] }`

---

### GET /guidelines/{id}
**Auth:** Any role  
**Response 200:** GuidelineDocOut with chunk_count

---

### PUT /guidelines/{id}
**Auth:** Admin  
**Request:**
```json
{
  "title": "Updated Title",
  "doc_type": "voice" | "terminology" | "facts" | "visual",
  "content_text": "Updated content text..."
}
```
**Response 200:** GuidelineDocOut

---

### DELETE /guidelines/{id}
**Auth:** Admin  
**Response 200:**
```json
{
  "status": "deleted",
  "id": "uuid"
}
```

---

## Audit Log

### GET /audit
**Auth:** Admin  
**Query params:** `page=1&per_page=50`  
**Response 200:**
```json
{
  "entries": [AuditLogOut],
  "total": int,
  "page": int
}
```

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
  "submitted_by": { "id": "uuid", "email": "string", "full_name": "string" },
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
  "created_at": "ISO8601",
  "chunk_count": 0
}
```

### AuditLogOut
```json
{
  "id": "uuid",
  "actor_email": "string|null",
  "action": "string",
  "resource_type": "string",
  "resource_id": "string",
  "detail": "string|null",
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

---

*Last updated: 2026-11-07*
