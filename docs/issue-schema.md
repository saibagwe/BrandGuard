# Issue Schema — BrandGuard AI

> **Source of truth for the Issue object.**  
> Defined in `backend/app/models/schemas.py` (Pydantic) and mirrored in `frontend/src/types/issue.ts` (TypeScript).  
> Never change one without updating the other.

---

## Issue Object

```typescript
interface Issue {
  id: string;                        // UUID
  review_id: string;                 // UUID of parent review
  category: "tone" | "fact" | "claim" | "visual" | "accessibility";
  severity: "high" | "medium" | "low";
  location: IssueLocation | null;    // text position or image region
  message: string;                   // plain-language explanation (required)
  evidence: IssueEvidence | null;    // must be present for fact/claim issues
  suggestion: string | null;         // intent-preserving fix suggestion
  status: "open" | "accepted" | "edited" | "dismissed";
}

interface IssueLocation {
  start: number | null;   // character offset in content
  end: number | null;     // character offset in content
  region: string | null;  // e.g. "top-left" for image region
}

interface IssueEvidence {
  source_doc: string;    // guideline doc title or ID
  quote: string | null;  // verbatim quote from guideline/fact doc
  rule_id: string | null; // specific rule identifier if applicable
}
```

---

## Pydantic Definition (Python)

```python
# backend/app/models/schemas.py
from pydantic import BaseModel
from typing import Literal, Optional

class IssueLocation(BaseModel):
    start: Optional[int] = None
    end: Optional[int] = None
    region: Optional[str] = None

class IssueEvidence(BaseModel):
    source_doc: str
    quote: Optional[str] = None
    rule_id: Optional[str] = None

class Issue(BaseModel):
    id: str
    review_id: str
    category: Literal["tone", "fact", "claim", "visual", "accessibility"]
    severity: Literal["high", "medium", "low"]
    location: Optional[IssueLocation] = None
    message: str
    evidence: Optional[IssueEvidence] = None
    suggestion: Optional[str] = None
    status: Literal["open", "accepted", "edited", "dismissed"] = "open"
```

---

## Rules & Invariants

| Rule | Description |
|------|-------------|
| **message is required** | Never emit an Issue without a plain-language explanation |
| **fact/claim needs evidence** | `evidence` must be non-null for `category="fact"` or `category="claim"`. If no approved source was found, set `evidence.quote = "No approved source found for this claim."` |
| **LLM output is validated** | All LLM-generated Issues are parsed through this Pydantic schema with one retry on validation failure |
| **suggestion is intent-preserving** | The suggestion should convey the same meaning as the original, just compliant |
| **location for text** | Use `{start, end}` character offsets for text content; `{region}` for image content |

---

## Severity Guide

| Severity | When to use |
|----------|-------------|
| `high` | Factual errors, serious brand violations, legal risk |
| `medium` | Tone inconsistencies, questionable claims, minor fact issues |
| `low` | Style suggestions, minor terminology preferences |

---

## Status Transitions

```
open → accepted   (reviewer accepts the suggestion as-is)
open → edited     (reviewer edits the suggestion text, then accepts)
open → dismissed  (reviewer dismisses the issue as not relevant)
```

---

## Check Module Output Contract

Every check module MUST return `list[Issue]`. The orchestrator:
1. Runs all checks in parallel
2. Wraps each in try/except — a failing check returns `[]`, never crashes the review
3. Merges all issue lists
4. Deduplicates by (category + location) if needed

---

*Schema version: 1.0 — Phase 0*  
*Do not change without updating `frontend/src/types/issue.ts` and noting in commit message.*
