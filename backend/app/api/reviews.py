"""Reviews router."""
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.db import Review, Issue as IssueDB, User
from app.models.schemas import (
    Issue,
    IssueEvidence,
    IssueLocation,
    ReviewCreate,
    ReviewOut,
)
from app.services import review_service, audit_service

router = APIRouter(prefix="/reviews", tags=["reviews"])


# ---------------------------------------------------------------------------
# Neutral sample — no auth needed
# ---------------------------------------------------------------------------

@router.get("/sample", response_model=ReviewOut)
def get_sample_review():
    """Empty neutral sample review — no auth required."""
    return ReviewOut(
        id="sample-review-001",
        title="Sample Review",
        content_text="BrandGuard AI provides automated compliance checking against uploaded brand guidelines.",
        content_type="text",
        status="draft",
        submitted_by="creator@brandguard.ai",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        issues=[],
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _db_issues_to_schema(db_issues: list[IssueDB]) -> list[Issue]:
    result = []
    for i in db_issues:
        location = None
        if i.location_start is not None or i.location_end is not None or i.location_region is not None:
            location = IssueLocation(
                start=i.location_start,
                end=i.location_end,
                region=i.location_region,
            )
        evidence = None
        if i.evidence_source_doc:
            evidence = IssueEvidence(
                source_doc=i.evidence_source_doc,
                quote=i.evidence_quote,
                rule_id=i.evidence_rule_id,
            )
        result.append(
            Issue(
                id=i.id,
                review_id=i.review_id,
                category=i.category,  # type: ignore[arg-type]
                severity=i.severity,  # type: ignore[arg-type]
                location=location,
                message=i.message,
                evidence=evidence,
                suggestion=i.suggestion,
                status=i.status,  # type: ignore[arg-type]
            )
        )
    return result


def _review_to_out(review: Review, db: Session) -> ReviewOut:
    db_issues = db.query(IssueDB).filter(IssueDB.review_id == review.id).all()
    return ReviewOut(
        id=review.id,
        title=review.title,
        content_text=review.content_text,
        content_type=review.content_type,
        status=review.status,
        submitted_by=review.submitted_by,
        created_at=review.created_at,
        updated_at=review.updated_at,
        issues=_db_issues_to_schema(db_issues),
    )


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
def create_review(
    payload: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("creator", "manager", "reviewer", "admin")),
):
    content_text = payload.content_text or payload.content or ""
    review = Review(
        id=str(uuid4()),
        title=payload.title,
        content_text=content_text,
        content_type=payload.content_type,
        status="draft",
        submitted_by=current_user.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    audit_service.log(db, current_user.id, "create", "review", review.id)
    return _review_to_out(review, db)


@router.get("", response_model=list[ReviewOut])
def list_reviews(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "creator":
        reviews = db.query(Review).filter(Review.submitted_by == current_user.id).all()
    else:
        reviews = (
            db.query(Review)
            .filter(Review.status.in_(["in_review", "changes_requested", "approved"]))
            .all()
        )
    return [_review_to_out(r, db) for r in reviews]


@router.get("/{review_id}", response_model=ReviewOut)
def get_review(
    review_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if current_user.role == "creator" and review.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return _review_to_out(review, db)


@router.post("/{review_id}/submit", response_model=ReviewOut)
def submit_review(
    review_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if current_user.role == "creator" and review.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if review.status not in ("draft", "changes_requested"):
        raise HTTPException(status_code=400, detail=f"Cannot submit a review with status '{review.status}'")

    review.status = "in_review"
    review.updated_at = datetime.utcnow()
    db.commit()

    # Run checks synchronously (review_service handles asyncio)
    review_service.run_checks(review, db)
    db.refresh(review)

    audit_service.log(db, current_user.id, "submit", "review", review.id)
    return _review_to_out(review, db)


@router.patch("/{review_id}/issues/{issue_id}", response_model=Issue)
def update_issue_status(
    review_id: str,
    issue_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    issue = (
        db.query(IssueDB)
        .filter(IssueDB.id == issue_id, IssueDB.review_id == review_id)
        .first()
    )
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    new_status = payload.get("status")
    if new_status not in ("accepted", "edited", "dismissed", "open"):
        raise HTTPException(status_code=400, detail="Invalid status value")

    issue.status = new_status
    db.commit()
    db.refresh(issue)

    audit_service.log(
        db, current_user.id, "update_issue_status", "issue", issue.id, detail=f"status={new_status}"
    )

    location = None
    if issue.location_start is not None or issue.location_end is not None or issue.location_region is not None:
        location = IssueLocation(start=issue.location_start, end=issue.location_end, region=issue.location_region)
    evidence = None
    if issue.evidence_source_doc:
        evidence = IssueEvidence(
            source_doc=issue.evidence_source_doc,
            quote=issue.evidence_quote,
            rule_id=issue.evidence_rule_id,
        )
    return Issue(
        id=issue.id,
        review_id=issue.review_id,
        category=issue.category,  # type: ignore[arg-type]
        severity=issue.severity,  # type: ignore[arg-type]
        location=location,
        message=issue.message,
        evidence=evidence,
        suggestion=issue.suggestion,
        status=issue.status,  # type: ignore[arg-type]
    )
