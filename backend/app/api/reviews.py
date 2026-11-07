"""Reviews router."""
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
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
from app.services.file_extraction import extract, ExtractionError

router = APIRouter(prefix="/reviews", tags=["reviews"])


# ---------------------------------------------------------------------------
# Hardcoded sample — no auth needed
# ---------------------------------------------------------------------------

_SAMPLE_REVIEW_ID = "sample-review-001"
_SAMPLE_ISSUES = [
    Issue(
        id="sample-issue-001",
        review_id=_SAMPLE_REVIEW_ID,
        category="tone",
        severity="high",
        location=IssueLocation(start=0, end=9),
        message="Casual language detected: ['hey', 'guys', 'gonna', 'awesome', 'lol', 'super']. These words violate Nimbus Bank brand voice guidelines.",
        evidence=IssueEvidence(
            source_doc="Terminology Rules",
            quote="Banned words: awesome, guys, gonna, wanna, lol, super, hey.",
            rule_id="TONE-001",
        ),
        suggestion=(
            "Rewrite as: 'Discover our summer savings offer. Enjoy 3.2% APY on your "
            "NimbusGrow Savings account — a rate designed to help you grow your money.'"
        ),
        status="open",
    ),
    Issue(
        id="sample-issue-002",
        review_id=_SAMPLE_REVIEW_ID,
        category="fact",
        severity="high",
        location=IssueLocation(start=72, end=82),
        message="Incorrect APY stated: '2.5% APY'. Approved fact states NimbusGrow Savings is 3.2% APY.",
        evidence=IssueEvidence(
            source_doc="Approved Facts",
            quote="NimbusGrow Savings: 3.2% APY as of Q1 2024.",
            rule_id="FACT-APY-001",
        ),
        suggestion="Replace '2.5% APY' with '3.2% APY'.",
        status="open",
    ),
    Issue(
        id="sample-issue-003",
        review_id=_SAMPLE_REVIEW_ID,
        category="claim",
        severity="medium",
        location=IssueLocation(start=100, end=113),
        message="Unsubstantiated superlative claims detected: ['best in class', 'unmatched']. These claims require substantiation or must be removed.",
        evidence=IssueEvidence(
            source_doc="Brand Guidelines",
            quote="All comparative or superlative claims must be substantiated with verified data.",
            rule_id="CLAIM-001",
        ),
        suggestion="Remove or qualify claims. Use 'competitive rates' instead of 'best in class', or cite a verified source.",
        status="open",
    ),
]

SAMPLE_REVIEW = ReviewOut(
    id=_SAMPLE_REVIEW_ID,
    title="Summer Savings Campaign",
    content_text=(
        "Hey guys! You're gonna love our awesome summer savings deal! "
        "Get 2.5% APY on your savings account - best in class rates that are totally "
        "unmatched in the industry! lol just kidding but seriously this is super great!"
    ),
    content_type="text",
    status="in_review",
    submitted_by="creator@nimbus.bank",
    created_at=datetime(2024, 1, 15, 10, 0, 0),
    updated_at=datetime(2024, 1, 15, 10, 0, 0),
    issues=_SAMPLE_ISSUES,
)


@router.get("/sample", response_model=ReviewOut)
def get_sample_review():
    """Hardcoded sample review — no auth required, for frontend dev."""
    return SAMPLE_REVIEW


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
# File upload endpoint (PDF / DOCX / plain text)
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def upload_review(
    title: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("creator", "reviewer")),
):
    """Create and immediately submit a review from an uploaded PDF, DOCX, or text file.

    Limits: 10 MB max. Supports PDF (requires selectable text), DOCX, TXT.
    """
    raw = await file.read()
    filename = file.filename or ""

    try:
        content_text, content_type = extract(filename, raw)
    except ExtractionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    review = Review(
        id=str(uuid4()),
        title=(title.strip() or filename) or "Uploaded Document",
        content_text=content_text,
        content_type=content_type,  # type: ignore[arg-type]
        status="draft",
        submitted_by=current_user.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    audit_service.log(db, current_user.id, "create", "review", review.id)

    # Immediately submit for AI checks
    review.status = "in_review"
    review.updated_at = datetime.utcnow()
    db.commit()
    review_service.run_checks(review, db)
    db.refresh(review)
    audit_service.log(db, current_user.id, "submit", "review", review.id)

    return _review_to_out(review, db)


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
def create_review(
    payload: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("creator", "reviewer")),
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
    current_user: User = Depends(require_role("reviewer")),
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
    if new_status == "edited" and payload.get("edited_suggestion"):
        issue.suggestion = payload["edited_suggestion"]
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
