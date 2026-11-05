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
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------------------------------------------------------
# Review schemas
# ---------------------------------------------------------------------------

class ReviewCreate(BaseModel):
    title: str
    content_text: str
    content_type: Literal["text", "pdf", "docx"] = "text"


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    content_text: str
    content_type: str
    status: str
    submitted_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    issues: list[Issue] = []


# ---------------------------------------------------------------------------
# Guideline schemas
# ---------------------------------------------------------------------------

class GuidelineDocCreate(BaseModel):
    title: str
    doc_type: Literal["voice", "terminology", "facts", "visual"]
    content_text: str


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
# Approval schemas
# ---------------------------------------------------------------------------

class ApprovalCreate(BaseModel):
    action: Literal["approved", "changes_requested"]
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
