from __future__ import annotations
from typing import Literal, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Sub-schemas
# ---------------------------------------------------------------------------

class IssueLocation(BaseModel):
    start: Optional[int] = None
    end: Optional[int] = None
    region: Optional[str] = None


class IssueEvidence(BaseModel):
    source_doc: str
    quote: Optional[str] = None
    rule_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Core Issue schema
# ---------------------------------------------------------------------------

class Issue(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    review_id: str
    category: Literal["tone", "fact", "claim", "visual", "accessibility"]
    severity: Literal["high", "medium", "low"]
    location: Optional[IssueLocation] = None
    message: str
    evidence: Optional[IssueEvidence] = None
    suggestion: Optional[str] = None
    status: Literal["open", "accepted", "edited", "dismissed"]


# ---------------------------------------------------------------------------
# User schemas
# ---------------------------------------------------------------------------

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    role: str
    full_name: Optional[str] = None
    is_active: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Auth schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------------------------------------------------------
# Approval schemas
# ---------------------------------------------------------------------------

class ApprovalCreate(BaseModel):
    action: Optional[Literal["approved", "changes_requested"]] = None
    decision: Optional[str] = None
    comment: Optional[str] = None


class ApprovalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    review_id: str
    approved_by: str
    action: str
    comment: Optional[str] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Review schemas
# ---------------------------------------------------------------------------

class ReviewCreate(BaseModel):
    title: str
    content_text: Optional[str] = None
    content: Optional[str] = None
    text: Optional[str] = None
    content_type: Literal["text", "pdf", "docx"] = "text"


class ReviewSubmitRequest(BaseModel):
    confirm_high: bool = False


class IssueAcceptRequest(BaseModel):
    replacement: Optional[str] = None


class IssueDismissRequest(BaseModel):
    reason: Optional[str] = None


class ContentUpdateRequest(BaseModel):
    text: str


class IssueCounts(BaseModel):
    high: int = 0
    medium: int = 0
    low: int = 0
    total: int = 0


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    content_text: str
    content: Optional[str] = None
    content_type: str
    source_type: Optional[str] = None
    original_filename: Optional[str] = None
    status: str
    content_version: int = 1
    checked_version: Optional[int] = None
    submitted_by: Optional[str] = None
    created_by: Optional[str] = None
    progress: Optional[dict[str, str]] = None
    latest_reviewer_comment: Optional[str] = None
    approval_history: list[ApprovalOut] = []
    no_guidelines: bool = False
    is_stale: bool = False
    message: Optional[str] = None
    issue_counts: Optional[IssueCounts] = None
    created_at: datetime
    updated_at: datetime
    issues: list[Issue] = []


# ---------------------------------------------------------------------------
# Guideline schemas
# ---------------------------------------------------------------------------

class GuidelineDocCreate(BaseModel):
    title: str
    doc_type: str
    content_text: str

    def normalized_doc_type(self) -> str:
        mapping = {
            "brand-voice": "voice",
            "brand_voice": "voice",
            "voice": "voice",
            "terminology": "terminology",
            "approved-facts": "facts",
            "approved_facts": "facts",
            "facts": "facts",
            "visual": "visual",
        }
        val = self.doc_type.strip().lower()
        return mapping.get(val, val)


class GuidelineDocUpdate(BaseModel):
    title: Optional[str] = None
    doc_type: Optional[str] = None
    content_text: Optional[str] = None

    def normalized_doc_type(self) -> Optional[str]:
        if self.doc_type is None:
            return None
        mapping = {
            "brand-voice": "voice",
            "brand_voice": "voice",
            "voice": "voice",
            "terminology": "terminology",
            "approved-facts": "facts",
            "approved_facts": "facts",
            "facts": "facts",
            "visual": "visual",
        }
        val = self.doc_type.strip().lower()
        return mapping.get(val, val)


class GuidelineDocOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    doc_type: str
    content_text: str
    created_by: Optional[str] = None
    created_at: datetime
    chunks_count: int = 0


# ---------------------------------------------------------------------------
# Audit log schema
# ---------------------------------------------------------------------------

class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    actor_id: Optional[str] = None
    action: str
    resource_type: str
    resource_id: str
    detail: Optional[str] = None
    created_at: datetime
