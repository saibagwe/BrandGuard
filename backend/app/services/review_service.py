"""Review service — orchestrates checks and persists results."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.db import Review, Issue as IssueDB
from app.models.schemas import Issue as IssueSchema
from app.checks.orchestrator import run_all_checks, build_context_from_db
from app.services import embedding_service, audit_service

logger = logging.getLogger(__name__)


def _schema_to_db(issue: IssueSchema, review_id: str) -> IssueDB:
    """Convert a schema Issue to an ORM Issue row."""
    return IssueDB(
        id=issue.id,
        review_id=review_id,
        category=issue.category,
        severity=issue.severity,
        location_start=issue.location.start if issue.location else None,
        location_end=issue.location.end if issue.location else None,
        location_region=issue.location.region if issue.location else None,
        message=issue.message,
        evidence_source_doc=issue.evidence.source_doc if issue.evidence else None,
        evidence_quote=issue.evidence.quote if issue.evidence else None,
        evidence_rule_id=issue.evidence.rule_id if issue.evidence else None,
        suggestion=issue.suggestion,
        status=issue.status,
        created_at=datetime.utcnow(),
    )


def run_checks(review: Review, db: Session) -> list[IssueDB]:
    """Run all checks against *review*, persist issues, and return them."""

    # Build context from stored guideline docs in db
    context = build_context_from_db(db, review.id, review.title)

    # Run checks (async inside a sync context)
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures  # noqa: PLC0415
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, run_all_checks(review.content_text, context))
                schema_issues = future.result()
        else:
            schema_issues = loop.run_until_complete(run_all_checks(review.content_text, context))
    except RuntimeError:
        schema_issues = asyncio.run(run_all_checks(review.content_text, context))

    # Remove previous issues for this review
    db.query(IssueDB).filter(IssueDB.review_id == review.id).delete()
    db.commit()

    db_issues: list[IssueDB] = []
    for schema_issue in schema_issues:
        db_issue = _schema_to_db(schema_issue, review.id)
        db.add(db_issue)
        db_issues.append(db_issue)

    db.commit()

    # Audit log
    audit_service.log(
        db=db,
        actor_id=review.submitted_by,
        action="run_checks",
        resource_type="review",
        resource_id=review.id,
        detail=f"Found {len(db_issues)} issues",
    )

    return db_issues
