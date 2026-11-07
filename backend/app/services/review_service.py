"""Review service — orchestrates checks, manages background processing, and persists results."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.db import Review, Issue as IssueDB
from app.models.schemas import Issue as IssueSchema
from app.checks import tone, facts, claims, accessibility, visual
from app.checks.orchestrator import build_context_from_db
from app.services import audit_service

logger = logging.getLogger(__name__)

CHECK_PIPELINE = [
    ("tone", tone.run),
    ("facts", facts.run),
    ("claims", claims.run),
    ("accessibility", accessibility.run),
    ("visual", visual.run),
]


def _schema_to_db(
    issue: IssueSchema,
    review_id: str,
    content: str,
    content_version: int,
    status_override: Optional[str] = None,
    dismiss_reason: Optional[str] = None,
) -> IssueDB:
    """Convert a schema Issue to an ORM Issue row with original quote and version."""
    start = issue.location.start if issue.location else None
    end = issue.location.end if issue.location else None
    original_quote = None
    if start is not None and end is not None and 0 <= start <= end <= len(content):
        original_quote = content[start:end]

    return IssueDB(
        id=issue.id or str(uuid4()),
        review_id=review_id,
        category=issue.category,
        severity=issue.severity,
        location_start=start,
        location_end=end,
        location_region=issue.location.region if issue.location else None,
        message=issue.message,
        evidence_source_doc=issue.evidence.source_doc if issue.evidence else None,
        evidence_quote=issue.evidence.quote if issue.evidence else None,
        evidence_rule_id=issue.evidence.rule_id if issue.evidence else None,
        suggestion=issue.suggestion,
        status=status_override or issue.status or "open",
        original_quote=original_quote,
        dismiss_reason=dismiss_reason,
        content_version=content_version,
        created_at=datetime.utcnow(),
    )


def run_checks_job(review_id: str) -> None:
    """Background worker job to run all checks with step-by-step progress logging."""
    db: Session = SessionLocal()
    try:
        review = db.query(Review).filter(Review.id == review_id).first()
        if not review or review.is_deleted:
            return

        run_checks(review, db)
    except Exception as exc:
        logger.error("Failed executing checks job for review %s: %s", review_id, exc)
    finally:
        db.close()


def run_checks(review: Review, db: Session) -> list[IssueDB]:
    """Execute check pipeline, track per-check progress, preserve dismissed issues, and save."""
    # Build initial progress map
    progress: dict[str, str] = {name: "pending" for name, _ in CHECK_PIPELINE}
    review.status = "checking"
    review.progress_json = json.dumps(progress)
    db.commit()

    context = build_context_from_db(db, review.id, review.title)
    content = review.content_text or ""
    all_issues: list[IssueSchema] = []

    # Remember previously dismissed issues so re-check keeps them dismissed if same category + quote
    existing_dismissed = (
        db.query(IssueDB)
        .filter(IssueDB.review_id == review.id, IssueDB.status == "dismissed")
        .all()
    )
    dismissed_lookup: dict[tuple[str, str], Optional[str]] = {}
    for d in existing_dismissed:
        quote = d.original_quote or ""
        dismissed_lookup[(d.category, quote)] = d.dismiss_reason

    # Run each check individually to track progress
    for check_name, check_fn in CHECK_PIPELINE:
        progress[check_name] = "running"
        review.progress_json = json.dumps(progress)
        db.commit()

        try:
            issues = check_fn(content, context)
            progress[check_name] = "done"
            all_issues.extend(issues)
        except Exception as exc:
            logger.error("Check '%s' failed on review %s: %s", check_name, review.id, exc)
            progress[check_name] = "failed"

        review.progress_json = json.dumps(progress)
        db.commit()

    # Clear previous issues for this review
    db.query(IssueDB).filter(IssueDB.review_id == review.id).delete()
    db.commit()

    # Save new issues
    db_issues: list[IssueDB] = []
    for schema_issue in all_issues:
        start = schema_issue.location.start if schema_issue.location else None
        end = schema_issue.location.end if schema_issue.location else None
        quote = ""
        if start is not None and end is not None and 0 <= start <= end <= len(content):
            quote = content[start:end]

        lookup_key = (schema_issue.category, quote)
        if quote and lookup_key in dismissed_lookup:
            status = "dismissed"
            reason = dismissed_lookup[lookup_key]
        else:
            status = schema_issue.status or "open"
            reason = None

        db_issue = _schema_to_db(
            schema_issue,
            review_id=review.id,
            content=content,
            content_version=review.content_version,
            status_override=status,
            dismiss_reason=reason,
        )
        db.add(db_issue)
        db_issues.append(db_issue)

    # Mark review ready and update checked_version
    review.status = "ready"
    review.checked_version = review.content_version
    review.progress_json = json.dumps(progress)
    review.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(review)

    audit_service.log(
        db=db,
        actor_id=review.created_by or review.submitted_by,
        action="run_checks",
        resource_type="review",
        resource_id=review.id,
        detail=f"Checks completed: {len(db_issues)} issues found",
    )

    return db_issues
