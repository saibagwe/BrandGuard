"""Reviews router."""
from __future__ import annotations

import io
import json
import logging
from datetime import datetime
from uuid import uuid4
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.db import Review, Issue as IssueDB, User, Approval, GuidelineDoc
from app.models.schemas import (
    Issue,
    IssueEvidence,
    IssueLocation,
    IssueCounts,
    ReviewCreate,
    ReviewOut,
    ReviewSubmitRequest,
    IssueAcceptRequest,
    IssueDismissRequest,
    ContentUpdateRequest,
    ApprovalOut,
)
from app.services import review_service, audit_service
from app.services.extraction_service import extract, ExtractionError

logger = logging.getLogger(__name__)

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
        message="Casual language detected: ['hey', 'guys', 'gonna', 'awesome', 'lol', 'super']. These words violate brand voice guidelines.",
        evidence=IssueEvidence(
            source_doc="Terminology Rules",
            quote="Banned words: awesome, guys, gonna, wanna, lol, super, hey.",
            rule_id="TONE-001",
        ),
        suggestion=(
            "Rewrite as: 'Discover our summer savings offer. Enjoy 3.2% APY on your "
            "Acme Savings account — a rate designed to help you grow your money.'"
        ),
        status="open",
    ),
    Issue(
        id="sample-issue-002",
        review_id=_SAMPLE_REVIEW_ID,
        category="fact",
        severity="high",
        location=IssueLocation(start=72, end=82),
        message="Incorrect APY stated: '2.5% APY'. Approved fact states Acme Savings is 3.2% APY.",
        evidence=IssueEvidence(
            source_doc="Approved Facts",
            quote="Acme Savings: 3.2% APY as of Q1 2024.",
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
    source_type="text",
    status="ready",
    submitted_by="creator@demo.local",
    created_by="creator@demo.local",
    content_version=1,
    checked_version=1,
    progress={"tone": "done", "facts": "done", "claims": "done", "accessibility": "done", "visual": "done"},
    issue_counts=IssueCounts(high=2, medium=1, low=0, total=3),
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
    
    # Progress
    progress_dict = None
    if review.progress_json:
        try:
            progress_dict = json.loads(review.progress_json)
        except Exception:
            progress_dict = None

    # Calculate issue counts by severity for open issues
    counts = IssueCounts()
    for iss in db_issues:
        if iss.status == "open":
            counts.total += 1
            sev = (iss.severity or "").lower()
            if sev == "high":
                counts.high += 1
            elif sev == "medium":
                counts.medium += 1
            elif sev == "low":
                counts.low += 1

    # Approvals and latest comment
    approvals = (
        db.query(Approval)
        .filter(Approval.review_id == review.id)
        .order_by(Approval.created_at.asc())
        .all()
    )
    user_map = {}
    for a in approvals:
        if a.approved_by and a.approved_by not in user_map:
            u = db.query(User).filter(User.id == a.approved_by).first()
            user_map[a.approved_by] = u.full_name if (u and u.full_name) else (u.email if u else a.approved_by)

    approval_history = [
        ApprovalOut(
            id=a.id,
            review_id=a.review_id,
            approved_by=a.approved_by,
            action=a.action,
            decision=a.action,
            reviewer_name=user_map.get(a.approved_by),
            comment=a.comment,
            created_at=a.created_at,
        )
        for a in approvals
    ]
    creator_id = review.created_by or review.submitted_by
    creator_user = db.query(User).filter(User.id == creator_id).first() if creator_id else None
    creator_name = (
        creator_user.full_name
        if (creator_user and creator_user.full_name)
        else (creator_user.email if creator_user else creator_id)
    )
    sub_at = getattr(review, "submitted_at", None)
    if not sub_at and review.status in ("in_review", "changes_requested", "approved"):
        sub_at = review.updated_at
    latest_comment = None
    for a in reversed(approvals):
        if a.comment:
            latest_comment = a.comment
            break

    is_stale = review.checked_version is None or review.checked_version < review.content_version

    message = None
    if review.no_guidelines:
        message = (
            "No brand guidelines have been added yet. "
            "A Reviewer needs to add them before your content can be checked."
        )

    return ReviewOut(
        id=review.id,
        title=review.title,
        content_text=review.content_text,
        content=review.content_text,
        content_type=review.content_type,
        source_type=review.source_type or review.content_type,
        original_filename=review.original_filename,
        status=review.status,
        content_version=review.content_version,
        checked_version=review.checked_version,
        submitted_by=review.submitted_by,
        created_by=review.created_by or review.submitted_by,
        creator_name=creator_name,
        submitted_at=sub_at,
        progress=progress_dict,
        latest_reviewer_comment=latest_comment,
        approval_history=approval_history,
        no_guidelines=bool(review.no_guidelines),
        is_stale=is_stale,
        message=message,
        issue_counts=counts,
        created_at=review.created_at,
        updated_at=review.updated_at,
        issues=_db_issues_to_schema(db_issues),
    )


# ---------------------------------------------------------------------------
# Create Review (POST /api/reviews) — JSON or Multipart
# ---------------------------------------------------------------------------

def create_review_from_data(
    title: str,
    content_text: str,
    source_type: str = "text",
    original_filename: Optional[str] = None,
    background_tasks: Optional[BackgroundTasks] = None,
    sync: bool = False,
    db: Session = None,
    current_user: User = None,
) -> ReviewOut:
    """Core creation logic for reviews."""
    if not title or not title.strip():
        raise HTTPException(status_code=400, detail="Title is required.")
    if not content_text or not content_text.strip():
        raise HTTPException(status_code=400, detail="Content text is required.")

    # Check if any guideline documents exist
    guidelines_count = db.query(GuidelineDoc).count()
    no_guidelines = guidelines_count == 0

    review = Review(
        id=str(uuid4()),
        title=title.strip(),
        content_text=content_text.strip(),
        content_type=source_type if source_type in ("text", "pdf", "docx") else "text",
        source_type=source_type,
        original_filename=original_filename,
        status="draft" if no_guidelines else "checking",
        content_version=1,
        checked_version=None,
        submitted_by=current_user.id,
        created_by=current_user.id,
        progress_json=None if no_guidelines else json.dumps({
            "tone": "pending",
            "facts": "pending",
            "claims": "pending",
            "accessibility": "pending",
            "visual": "pending",
        }),
        no_guidelines=no_guidelines,
        is_deleted=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    audit_service.log(
        db,
        current_user.id,
        "create_review",
        "review",
        review.id,
        f"Created review '{review.title}' (source: {source_type})",
    )

    if not no_guidelines:
        if sync or background_tasks is None:
            review_service.run_checks(review, db)
        else:
            background_tasks.add_task(review_service.run_checks_job, review.id)

    return _review_to_out(review, db)


@router.post("", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def create_review(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("creator", "manager", "reviewer", "admin")),
):
    """Create a new review from either JSON {title, text} or multipart file upload."""
    content_type_header = request.headers.get("content-type", "")

    if content_type_header.startswith("multipart/form-data"):
        form = await request.form()
        title = str(form.get("title") or "").strip()
        upload_item = form.get("file")
        if not upload_item or not hasattr(upload_item, "read"):
            raise HTTPException(status_code=400, detail="A file is required for file upload submission.")

        raw = await upload_item.read()
        original_filename = getattr(upload_item, "filename", "") or ""

        try:
            content_text, source_type = extract(original_filename, raw)
        except ExtractionError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        if not title:
            # Derive default title from filename without extension
            title = original_filename.rsplit(".", 1)[0] if "." in original_filename else original_filename
            title = title or "Uploaded Document"

        return create_review_from_data(
            title=title,
            content_text=content_text,
            source_type=source_type,
            original_filename=original_filename,
            background_tasks=background_tasks,
            db=db,
            current_user=current_user,
        )

    else:
        # JSON body
        try:
            data = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body.")

        title = str(data.get("title") or "").strip()
        content_text = str(data.get("text") or data.get("content_text") or data.get("content") or "").strip()

        return create_review_from_data(
            title=title,
            content_text=content_text,
            source_type="text",
            background_tasks=background_tasks,
            db=db,
            current_user=current_user,
        )


# ---------------------------------------------------------------------------
# Legacy file upload endpoint (delegates to standard extraction & creation)
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def upload_review(
    title: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("creator", "reviewer")),
):
    raw = await file.read()
    filename = file.filename or ""

    try:
        content_text, source_type = extract(filename, raw)
    except ExtractionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    final_title = (title.strip() or filename.rsplit(".", 1)[0]) or "Uploaded Document"

    guidelines_count = db.query(GuidelineDoc).count()
    no_guidelines = guidelines_count == 0

    review = Review(
        id=str(uuid4()),
        title=final_title,
        content_text=content_text,
        content_type=source_type if source_type in ("text", "pdf", "docx") else "text",
        source_type=source_type,
        original_filename=filename,
        status="draft" if no_guidelines else "checking",
        content_version=1,
        checked_version=None,
        submitted_by=current_user.id,
        created_by=current_user.id,
        no_guidelines=no_guidelines,
        is_deleted=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    audit_service.log(
        db,
        current_user.id,
        "create_review",
        "review",
        review.id,
        f"Uploaded review '{review.title}' (file: {filename})",
    )

    if not no_guidelines:
        background_tasks.add_task(review_service.run_checks_job, review.id)

    return _review_to_out(review, db)


# ---------------------------------------------------------------------------
# List Reviews
# ---------------------------------------------------------------------------

@router.get("", response_model=list[ReviewOut])
def list_reviews(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List reviews. Creators see only their own reviews; Reviewers see submitted reviews."""
    query = db.query(Review).filter(Review.is_deleted == False)

    if current_user.role == "creator":
        query = query.filter(
            or_(Review.created_by == current_user.id, Review.submitted_by == current_user.id)
        )
    else:
        query = query.filter(Review.status.in_(["in_review", "changes_requested", "approved"]))

    if status:
        query = query.filter(Review.status == status)

    reviews = query.order_by(Review.created_at.desc()).all()
    return [_review_to_out(r, db) for r in reviews]


# ---------------------------------------------------------------------------
# Get Review Detail
# ---------------------------------------------------------------------------

@router.get("/{review_id}", response_model=ReviewOut)
def get_review(
    review_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(Review.id == review_id, Review.is_deleted == False).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    if current_user.role == "creator":
        if review.created_by != current_user.id and review.submitted_by != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied: you can only view your own reviews.")
    else:
        # Reviewers can only access submitted reviews (in_review, changes_requested, approved)
        if review.status not in ("in_review", "changes_requested", "approved") and review.created_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied: Reviewers can only access submitted reviews.",
            )

    return _review_to_out(review, db)


# ---------------------------------------------------------------------------
# Edit Content (PUT /api/reviews/{id}/content)
# ---------------------------------------------------------------------------

@router.put("/{review_id}/content", response_model=ReviewOut)
def update_review_content(
    review_id: str,
    payload: ContentUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(Review.id == review_id, Review.is_deleted == False).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    if review.created_by != current_user.id and review.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: only the review owner can edit content.")

    if review.status not in ("draft", "ready", "changes_requested"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot edit content while review status is '{review.status}'. Content is locked.",
        )

    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Content text cannot be empty.")

    review.content_text = payload.text
    review.content_version += 1
    review.updated_at = datetime.utcnow()

    # Clear location on open issues because document offsets changed
    open_issues = db.query(IssueDB).filter(IssueDB.review_id == review.id, IssueDB.status == "open").all()
    for iss in open_issues:
        iss.location_start = None
        iss.location_end = None
        iss.location_region = None

    db.commit()
    db.refresh(review)

    audit_service.log(
        db,
        current_user.id,
        "edit_content",
        "review",
        review.id,
        f"Updated content to version {review.content_version}",
    )

    return _review_to_out(review, db)


# ---------------------------------------------------------------------------
# Re-check (POST /api/reviews/{id}/recheck)
# ---------------------------------------------------------------------------

@router.post("/{review_id}/recheck", response_model=ReviewOut)
def recheck_review(
    review_id: str,
    background_tasks: BackgroundTasks,
    sync: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("creator", "reviewer")),
):
    review = db.query(Review).filter(Review.id == review_id, Review.is_deleted == False).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    if review.created_by != current_user.id and review.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: only the review owner can trigger a re-check.")

    if review.status not in ("draft", "ready", "changes_requested"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot re-check content while review status is '{review.status}'.",
        )

    guidelines_count = db.query(GuidelineDoc).count()
    if guidelines_count == 0:
        review.no_guidelines = True
        db.commit()
        return _review_to_out(review, db)

    review.no_guidelines = False
    review.status = "checking"
    db.commit()

    if sync or background_tasks is None:
        review_service.run_checks(review, db)
    else:
        background_tasks.add_task(review_service.run_checks_job, review.id)

    audit_service.log(
        db,
        current_user.id,
        "recheck",
        "review",
        review.id,
        f"Triggered re-check for content version {review.content_version}",
    )

    return _review_to_out(review, db)


# ---------------------------------------------------------------------------
# Accept Suggestion (POST /api/reviews/{id}/issues/{issue_id}/accept)
# ---------------------------------------------------------------------------

@router.post("/{review_id}/issues/{issue_id}/accept", response_model=ReviewOut)
def accept_issue_suggestion(
    review_id: str,
    issue_id: str,
    payload: Optional[IssueAcceptRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(Review.id == review_id, Review.is_deleted == False).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    if review.created_by != current_user.id and review.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: only the review owner can accept suggestions.")

    if review.status not in ("draft", "ready", "changes_requested"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot modify issues while review status is '{review.status}'. Review is locked.",
        )

    issue = db.query(IssueDB).filter(IssueDB.id == issue_id, IssueDB.review_id == review.id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    start = issue.location_start
    end = issue.location_end
    if start is None or end is None:
        raise HTTPException(
            status_code=400,
            detail="Issue does not have valid text coordinates or has become stale. Please re-check.",
        )

    content = review.content_text or ""
    if not (0 <= start <= end <= len(content)):
        raise HTTPException(
            status_code=400,
            detail="Issue coordinates are out of bounds. Please re-check the document.",
        )

    # Verify text at location still equals original quote
    current_slice = content[start:end]
    if issue.original_quote and current_slice != issue.original_quote:
        raise HTTPException(
            status_code=400,
            detail="Content at this location has changed. Please re-check the document before applying suggestions.",
        )

    # Determine replacement text
    replacement = payload.replacement if (payload and payload.replacement is not None) else issue.suggestion
    if replacement is None:
        replacement = ""

    # Apply replacement
    new_content = content[:start] + replacement + content[end:]
    delta = len(replacement) - (end - start)
    review.content_text = new_content

    # Status: accepted (as-is) or edited (custom replacement)
    is_edited = payload is not None and payload.replacement is not None and payload.replacement != issue.suggestion
    issue.status = "edited" if is_edited else "accepted"
    issue.suggestion = replacement
    issue.original_quote = replacement
    issue.location_end = start + len(replacement)

    # Increment content_version and checked_version together (targeted edit keeps report valid)
    review.content_version += 1
    review.checked_version = review.content_version
    review.updated_at = datetime.utcnow()

    # Shift subsequent issues and invalidate overlapping ones
    other_issues = (
        db.query(IssueDB)
        .filter(IssueDB.review_id == review.id, IssueDB.id != issue.id)
        .all()
    )
    for other in other_issues:
        o_start = other.location_start
        o_end = other.location_end
        if o_start is None or o_end is None:
            continue

        if o_start >= end:
            # Shift later issues
            other.location_start = o_start + delta
            other.location_end = o_end + delta
        elif not (o_end <= start or o_start >= end):
            # Overlapped the replaced range
            other.location_start = None
            other.location_end = None
            other.location_region = None
            other.message += " (Location cleared due to overlapping edit; re-check recommended.)"

    db.commit()
    db.refresh(review)

    audit_service.log(
        db,
        current_user.id,
        "accept_issue",
        "issue",
        issue.id,
        f"Applied suggestion for issue {issue.id} (status={issue.status})",
    )

    return _review_to_out(review, db)


# ---------------------------------------------------------------------------
# Dismiss / Reopen Issue
# ---------------------------------------------------------------------------

@router.post("/{review_id}/issues/{issue_id}/dismiss", response_model=ReviewOut)
def dismiss_issue(
    review_id: str,
    issue_id: str,
    payload: Optional[IssueDismissRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(Review.id == review_id, Review.is_deleted == False).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    if review.created_by != current_user.id and review.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: only the review owner can dismiss issues.")

    if review.status not in ("draft", "ready", "changes_requested"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot dismiss issues while review status is '{review.status}'.",
        )

    issue = db.query(IssueDB).filter(IssueDB.id == issue_id, IssueDB.review_id == review.id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    issue.status = "dismissed"
    issue.dismiss_reason = payload.reason if payload else None
    db.commit()

    audit_service.log(
        db,
        current_user.id,
        "dismiss_issue",
        "issue",
        issue.id,
        f"Dismissed issue (reason: {issue.dismiss_reason or 'none'})",
    )

    return _review_to_out(review, db)


@router.post("/{review_id}/issues/{issue_id}/reopen", response_model=ReviewOut)
def reopen_issue(
    review_id: str,
    issue_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(Review.id == review_id, Review.is_deleted == False).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    if review.created_by != current_user.id and review.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: only the review owner can reopen issues.")

    if review.status not in ("draft", "ready", "changes_requested"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reopen issues while review status is '{review.status}'.",
        )

    issue = db.query(IssueDB).filter(IssueDB.id == issue_id, IssueDB.review_id == review.id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    issue.status = "open"
    issue.dismiss_reason = None
    db.commit()

    audit_service.log(
        db,
        current_user.id,
        "reopen_issue",
        "issue",
        issue.id,
        "Reopened issue",
    )

    return _review_to_out(review, db)


# ---------------------------------------------------------------------------
# Submit for Approval (POST /api/reviews/{id}/submit)
# ---------------------------------------------------------------------------

@router.post("/{review_id}/submit", response_model=ReviewOut)
def submit_review_for_approval(
    review_id: str,
    payload: Optional[ReviewSubmitRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(Review.id == review_id, Review.is_deleted == False).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    if review.created_by != current_user.id and review.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: only the review owner can submit for approval.")

    if review.status not in ("ready", "changes_requested"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit review with status '{review.status}'. Must be 'ready' or 'changes_requested'.",
        )

    # Check stale condition
    if review.content_version != review.checked_version:
        return JSONResponse(
            status_code=409,
            content={
                "code": "stale",
                "detail": "Report is out of date. Please re-check before submitting.",
            },
        )

    # Check open high severity issues
    open_high_count = (
        db.query(IssueDB)
        .filter(IssueDB.review_id == review.id, IssueDB.severity == "high", IssueDB.status == "open")
        .count()
    )
    if open_high_count > 0 and not (payload and payload.confirm_high):
        return JSONResponse(
            status_code=409,
            content={
                "code": "high_open",
                "detail": f"{open_high_count} high-severity issue(s) are still open. Please confirm submission.",
                "open_high_count": open_high_count,
            },
        )

    review.status = "in_review"
    review.submitted_by = current_user.id
    review.submitted_at = datetime.utcnow()
    review.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(review)

    audit_service.log(
        db,
        current_user.id,
        "submit_for_approval",
        "review",
        review.id,
        "Submitted review for approval",
    )

    return _review_to_out(review, db)


# ---------------------------------------------------------------------------
# Export (GET /api/reviews/{id}/export?format=txt|docx)
# ---------------------------------------------------------------------------

@router.get("/{review_id}/export")
def export_review(
    review_id: str,
    format: str = "txt",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(Review.id == review_id, Review.is_deleted == False).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    # Allowed to owner or reviewer / manager / admin
    is_owner = (review.created_by == current_user.id or review.submitted_by == current_user.id)
    is_staff = current_user.role in ("reviewer", "manager", "admin")
    if not is_owner and not is_staff:
        raise HTTPException(status_code=403, detail="Access denied: cannot export this review.")

    safe_title = "".join(c for c in review.title if c.isalnum() or c in (" ", "-", "_")).strip() or "review"
    fmt = format.lower().strip()

    audit_service.log(
        db,
        current_user.id,
        "export_review",
        "review",
        review.id,
        f"Exported text in {fmt} format",
    )

    if fmt == "docx":
        try:
            from docx import Document
        except ImportError:
            raise HTTPException(status_code=500, detail="python-docx is not installed on the server.")

        doc = Document()
        for paragraph in (review.content_text or "").split("\n"):
            doc.add_paragraph(paragraph)

        bio = io.BytesIO()
        doc.save(bio)
        bio.seek(0)
        return Response(
            content=bio.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.docx"'},
        )
    elif fmt == "txt":
        return Response(
            content=review.content_text or "",
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.txt"'},
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported export format. Supported: 'txt', 'docx'.")


# ---------------------------------------------------------------------------
# Delete Review (DELETE /api/reviews/{id})
# ---------------------------------------------------------------------------

@router.delete("/{review_id}")
def delete_review(
    review_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(Review.id == review_id, Review.is_deleted == False).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    if review.created_by != current_user.id and review.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: only the review owner can delete it.")

    if review.status not in ("draft", "ready"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete review in status '{review.status}'. Only draft or ready reviews can be deleted.",
        )

    review.is_deleted = True
    review.updated_at = datetime.utcnow()
    db.commit()

    audit_service.log(
        db,
        current_user.id,
        "delete_review",
        "review",
        review.id,
        f"Deleted review '{review.title}'",
    )

    return {"status": "deleted", "id": review.id}


# ---------------------------------------------------------------------------
# Backward-compatible PATCH issue status
# ---------------------------------------------------------------------------

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
