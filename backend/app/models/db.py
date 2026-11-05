from uuid import uuid4
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Integer, Boolean, DateTime, ForeignKey, Enum as SAEnum
)
from app.database import Base


def _uuid():
    return str(uuid4())


def _now():
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum("creator", "manager", "reviewer", "admin", name="user_role"), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_now)


class GuidelineDoc(Base):
    __tablename__ = "guideline_docs"

    id = Column(String(36), primary_key=True, default=_uuid)
    title = Column(String(255), nullable=False)
    doc_type = Column(SAEnum("voice", "terminology", "facts", "visual", name="doc_type"), nullable=False)
    content_text = Column(Text, nullable=False)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=_now)


class GuidelineChunk(Base):
    __tablename__ = "guideline_chunks"

    id = Column(String(36), primary_key=True, default=_uuid)
    doc_id = Column(String(36), ForeignKey("guideline_docs.id"), nullable=False)
    chunk_text = Column(Text, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    embedding_json = Column(Text, nullable=True)  # JSON-encoded float array
    created_at = Column(DateTime, default=_now)


class Review(Base):
    __tablename__ = "reviews"

    id = Column(String(36), primary_key=True, default=_uuid)
    title = Column(String(255), nullable=False)
    content_text = Column(Text, nullable=False)
    content_type = Column(SAEnum("text", "pdf", "docx", name="content_type"), nullable=False, default="text")
    status = Column(
        SAEnum("draft", "in_review", "changes_requested", "approved", name="review_status"),
        nullable=False,
        default="draft",
    )
    submitted_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


class Issue(Base):
    __tablename__ = "issues"

    id = Column(String(36), primary_key=True, default=_uuid)
    review_id = Column(String(36), ForeignKey("reviews.id"), nullable=False, index=True)
    category = Column(
        SAEnum("tone", "fact", "claim", "visual", "accessibility", name="issue_category"),
        nullable=False,
    )
    severity = Column(SAEnum("high", "medium", "low", name="issue_severity"), nullable=False)
    location_start = Column(Integer, nullable=True)
    location_end = Column(Integer, nullable=True)
    location_region = Column(String(255), nullable=True)
    message = Column(Text, nullable=False)
    evidence_source_doc = Column(String(255), nullable=True)
    evidence_quote = Column(Text, nullable=True)
    evidence_rule_id = Column(String(255), nullable=True)
    suggestion = Column(Text, nullable=True)
    status = Column(
        SAEnum("open", "accepted", "edited", "dismissed", name="issue_status"),
        nullable=False,
        default="open",
    )
    created_at = Column(DateTime, default=_now)


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(String(36), primary_key=True, default=_uuid)
    review_id = Column(String(36), ForeignKey("reviews.id"), nullable=False)
    approved_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    action = Column(SAEnum("approved", "changes_requested", name="approval_action"), nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=_uuid)
    actor_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    action = Column(String(255), nullable=False)
    resource_type = Column(String(255), nullable=False)
    resource_id = Column(String(255), nullable=False)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_now)
