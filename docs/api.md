# API Reference - BrandGuard AI

Base URL: `https://<your-render-app>.onrender.com/api`
Local: `http://localhost:8000/api`

All authenticated endpoints require `Authorization: Bearer <token>` header unless explicitly stated.

---

## Authentication

### POST /auth/login
No auth required.

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

**Errors:** 400 (missing email/username), 401 (invalid credentials), 403 (account disabled).

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
**Auth:** Creator, Manager, Reviewer, Admin  
Accepts either JSON `{ "title": "...", "text": "..." }` or `multipart/form-data` with ONE file (`file` and optional `title`).  
Supported file types: PDF (.pdf), Word (.docx), Plain Text (.txt). Max file size: 10 MB.  
If no brand guidelines exist, creates the review in `draft` status with `no_guidelines: true` without running checks. If guidelines exist, sets status to `checking` and initiates background AI checks.

**Request (JSON):**
```json
{ "title": "Summer Campaign", "text": "Content to review..." }
```

**Request (Multipart):**
Form fields: `title` (string, optional), `file` (binary PDF, DOCX, or TXT, max 10 MB).

**Errors:** 400 (empty file, oversized >10 MB, unsupported file type, scanned image-only PDF with no extractable text).

**Response 201:** ReviewOut

---

### GET /reviews
**Auth:** Any role  
Creators see only their own non-deleted reviews. Reviewers/Managers see all submitted reviews (`in_review`, `changes_requested`, `approved`, `ready`). Newest first.  
**Query params:** `status` (optional filter: `draft`, `checking`, `ready`, `in_review`, `changes_requested`, `approved`)  
**Response 200:** `[ReviewOut]`

---

### GET /reviews/{id}
**Auth:** Creator (own review only), Reviewer, Manager, Admin  
**Errors:** 403 (Creator attempting to view another user's review), 404 (not found).  
**Response 200:** ReviewOut (including progress, status, checked_version, content_version, latest_reviewer_comment, approval_history, issue_counts).

---

### PUT /reviews/{id}/content
**Auth:** Creator (owner only)  
Allowed only when status is `draft`, `ready`, or `changes_requested`. Rejects edits if locked (`checking`, `in_review`, `approved`).  
Increments `content_version`, marks the report stale (`is_stale: true`, `checked_version < content_version`), and clears location coordinates on open issues.

**Request:**
```json
{ "text": "Updated content text..." }
```

**Errors:** 400 (empty text, review locked in checking/in_review/approved), 403 (not the review owner), 404 (not found).  
**Response 200:** ReviewOut

---

### POST /reviews/{id}/recheck
**Auth:** Creator (owner only)  
Allowed only when status is `draft`, `ready`, or `changes_requested`.  
Re-runs AI checks in the background (or synchronously when `sync=true`). Replaces open issues with new issues, but preserves any previously dismissed issues that have matching category and quoted text. Sets `checked_version = content_version` and status to `ready`.

**Query params:** `sync` (boolean, optional, default false)  
**Errors:** 400 (review locked), 403 (not the review owner), 404 (not found).  
**Response 200:** ReviewOut

---

### POST /reviews/{id}/issues/{issue_id}/accept
**Auth:** Creator (owner only)  
Applies the suggestion (or custom replacement) to the content at the issue's location.  
Verifies that the text currently at `{start, end}` matches the issue's recorded original quote; if not, returns 400.  
Increments `content_version` AND `checked_version` together (targeted edit maintains report validity). Shifts `{start, end}` coordinates of subsequent issues, and invalidates coordinates (sets location to null) on any overlapping issues. Marks issue as `accepted` (or `edited` if custom replacement differs from suggestion).

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

**Request:**
```json
{ "reason": "Approved marketing exception" }
```

**Errors:** 400 (review locked), 403 (not owner), 404 (not found).  
**Response 200:** ReviewOut

---

### POST /reviews/{id}/issues/{issue_id}/reopen
**Auth:** Creator (owner only)  
Reopens a previously dismissed issue, restoring it to `open` status.

**Errors:** 400 (review locked), 403 (not owner), 404 (not found).  
**Response 200:** ReviewOut

---

### POST /reviews/{id}/submit
**Auth:** Creator (owner only)  
Submits content for reviewer approval. Allowed from `ready` or `changes_requested` status.  
If content is stale (`content_version != checked_version`), returns 409 `{ "code": "stale" }`.  
If any HIGH-severity issues remain open, returns 409 `{ "code": "high_open" }` unless explicitly confirmed with `{ "confirm_high": true }`.  
On success, changes status to `in_review` and locks editing.

**Request:**
```json
{ "confirm_high": false }
```

**Errors:**  
- 400 (invalid status, e.g. already in_review or draft)  
- 403 (not review owner)  
- 409 with `{ "code": "stale", "detail": "Report is out of date. Please re-check before submitting." }`  
- 409 with `{ "code": "high_open", "detail": "...", "open_high_count": int }`

**Response 200:** ReviewOut

---

### GET /reviews/{id}/export
**Auth:** Creator (owner), Reviewer, Manager, Admin  
Exports the current corrected document text.

**Query params:** `format` (`txt` or `docx`, default `txt`)  
**Response 200:** Binary file stream with `Content-Disposition: attachment; filename="<title>.<ext>"`

---

### DELETE /reviews/{id}
**Auth:** Creator (owner only)  
Soft-deletes a review. Allowed only while status is `draft` or `ready`.

**Errors:** 400 (cannot delete review in `checking`, `in_review`, `changes_requested`, or `approved`), 403 (not owner), 404 (not found).  
**Response 200:** `{ "status": "deleted", "id": "uuid" }`

---

### GET /reviews/sample
**Auth:** None (public dev helper)  
Returns hardcoded sample review.

---

## Approvals

### POST /reviews/{id}/approve
**Auth:** Manager, Reviewer, Admin  
Approves or requests changes on a review. Creators are rejected with 403 Forbidden.

**Request:**
```json
{
  "action": "approved",
  "comment": "Reviewer comment or feedback"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "review_id": "uuid",
  "approved_by": "user-uuid",
  "action": "approved",
  "comment": "...",
  "created_at": "ISO8601"
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
  "content": "string",
  "content_type": "text | pdf | docx",
  "source_type": "text | pdf | docx",
  "original_filename": "string | null",
  "status": "draft | checking | ready | in_review | changes_requested | approved",
  "content_version": 1,
  "checked_version": 1,
  "submitted_by": "user-uuid",
  "created_by": "user-uuid",
  "progress": {
    "tone": "done",
    "facts": "done",
    "claims": "done",
    "accessibility": "done",
    "visual": "done"
  },
  "latest_reviewer_comment": "string | null",
  "approval_history": [
    {
      "id": "uuid",
      "review_id": "uuid",
      "approved_by": "user-uuid",
      "action": "changes_requested",
      "comment": "...",
      "created_at": "ISO8601"
    }
  ],
  "no_guidelines": false,
  "is_stale": false,
  "issue_counts": {
    "high": 0,
    "medium": 1,
    "low": 0,
    "total": 1
  },
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "issues": []
}
```

### Issue
See [docs/issue-schema.md](./issue-schema.md).
