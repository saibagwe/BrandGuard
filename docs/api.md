# API Reference — BrandGuard AI

Base URL: `https://<your-render-app>.onrender.com/api`
Local: `http://localhost:8000/api`

All authenticated endpoints require `Authorization: Bearer <token>` header unless explicitly stated.

---

## Authentication

### POST /auth/login
No auth required. Only active accounts with `creator` or `reviewer` roles can authenticate.

**Request:**
```json
{ "email": "creator@demo.local", "password": "demo1234" }
```

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "creator@demo.local",
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
{ "title": "Summer Campaign", "text": "Content to review..." }
```

**Request (Multipart):**
Form fields: `title` (string, optional), `file` (binary PDF, DOCX, or TXT, max 10 MB).

**Errors:** 400 (empty file, oversized >10 MB, unsupported file type, scanned image-only PDF with no extractable text).

**Response 201:** ReviewOut

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

### PUT /reviews/{id}/content
**Auth:** Creator (owner only)  
Allowed only when status is `draft`, `ready`, or `changes_requested`. Rejects edits if locked (`checking`, `in_review`, `approved`).  
Increments `content_version`, marks the report stale (`is_stale: true`, `checked_version < content_version`), and clears location coordinates on open issues.

**Request:**
```json
{ "text": "Updated content text..." }
```

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

### POST /reviews/{id}/issues/{issue_id}/accept
**Auth:** Creator (owner only)  
Applies the suggestion (or custom replacement) to the content at the issue's location.  
Verifies that the text currently at `{start, end}` matches the issue's recorded original quote; if not, returns 400.  
Increments `content_version` AND `checked_version` together (targeted edit maintains report validity). Shifts `{start, end}` coordinates of subsequent issues, and invalidates coordinates (sets location to null) on any overlapping issues. Marks issue as `accepted` (or `edited` if custom replacement differs from suggestion).

---

### PATCH /reviews/{id}/issues/{issue_id}
**Auth:** Reviewer  
**Request:**
```json
{ "replacement": "Optional custom replacement text" }
```

**Errors:** 400 (review locked, quote mismatch, invalid coordinates), 403 (not the review owner), 404 (review or issue not found).  
**Response 200:** ReviewOut

---

### POST /reviews/{id}/issues/{issue_id}/dismiss
**Auth:** Creator (owner only)  
Dismisses the issue with an optional reason stored for compliance and analytics. Dismissed items are preserved during re-checks.

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

**Errors:** 400 (review locked), 403 (not owner), 404 (not found).  
**Response 200:** ReviewOut

---

### GET /approvals
**Auth:** Reviewer  
Returns reviews in `in_review` status needing approval.  
**Response 200:** `[ReviewOut]`

---

### POST /reviews/{id}/submit
**Auth:** Creator (owner only)  
Submits content for reviewer approval. Allowed from `ready` or `changes_requested` status.  
If content is stale (`content_version != checked_version`), returns 409 `{ "code": "stale" }`.  
If any HIGH-severity issues remain open, returns 409 `{ "code": "high_open" }` unless explicitly confirmed with `{ "confirm_high": true }`.  
On success, changes status to `in_review` and locks editing.

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


---

## Reviewer Decisions

### POST /reviews/{id}/decision
**Auth:** Reviewer only. Review must be in `in_review` status.

Decide on a submitted review.

**Request body:**
```json
{ "action": "approved" | "changes_requested", "comment": "string (required for changes_requested)" }
```

**Validation:**
- `action` must be `"approved"` or `"changes_requested"` — any other value returns 422.
- Status must be `"in_review"` — otherwise 409 `{"code": "wrong_status", "detail": "..."}`.
- Reviewer cannot decide a review they created — 403.
- `"changes_requested"` with empty/missing `comment` returns 422.
- `"approved"` comment is optional.

**Response:** `ReviewOut` with updated `status` and `approval_history`.

**Side effects:** Writes an `audit_log` entry. `changes_requested` sets `review.status = "changes_requested"` (unlocks Creator editing). `approved` locks the review.

---

## Guidelines Management

### POST /guidelines
**Auth:** Reviewer only.

Create a guideline document from pasted text.

**Request body:**
```json
{ "title": "string", "doc_type": "voice|terminology|facts", "content_text": "string" }
```

**Response:** `GuidelineDocOut`

---

### POST /guidelines/upload
**Auth:** Reviewer only.

Upload a PDF, DOCX, or TXT file (max 10 MB) to create a guideline document.

**Form fields:** `file` (multipart), `doc_type` (voice|terminology|facts), optional `title`.

**Response:** `GuidelineDocOut`

---

### PUT /guidelines/{id}
### PATCH /guidelines/{id}
**Auth:** Reviewer only.

Update title, doc_type, or content of an existing guideline. Re-embeds chunks on content change.

**Request body:** Same as POST (all fields optional for PATCH).

**Response:** `GuidelineDocOut`

---

### DELETE /guidelines/{id}
**Auth:** Reviewer only.

Delete a guideline document and its embedding chunks.

**Response:** `{"ok": true}` or 204 No Content.

---

## Audit Log

### GET /audit
**Auth:** Reviewer only.

List audit log entries, newest first.

**Query params:**
- `user` — filter by actor email (partial match)
- `action` — filter by exact action string
- `review_id` — filter by review UUID
- `limit` — default 50
- `offset` — default 0

**Response:** Array of `AuditLogOut`:
```json
[{
  "id": "uuid",
  "actor_id": "uuid",
  "actor_name": "string",
  "actor_email": "string",
  "role": "creator|reviewer",
  "action": "string",
  "review_id": "uuid|null",
  "detail": "string|null",
  "created_at": "ISO8601"
}]
```

**Actions logged:** `review_created`, `content_edited`, `issue_accepted`, `issue_dismissed`, `issue_reopened`, `review_submitted`, `approved`, `changes_requested`, `guideline_created`, `guideline_updated`, `guideline_deleted`.

---

## Updated GET /reviews Visibility

| Role | Statuses visible |
|------|-----------------|
| Creator | Only their own reviews (all statuses) |
| Reviewer | Only `in_review`, `changes_requested`, `approved` (never `draft`, `checking`, `ready`) |

## Updated GET /reviews/{id}

Returns `ReviewOut` which now includes:
- `creator_name` — full name of the creator
- `submitted_at` — ISO8601 timestamp when submitted for review
- `latest_reviewer_comment` — most recent reviewer comment (if any)
- `approval_history` — array of `ApprovalOut` enriched with `reviewer_name`
- `no_guidelines` — boolean, true if no guideline documents exist at review creation time

A Reviewer can read any submitted review (`in_review` / `changes_requested` / `approved`). A Creator can only read their own.
