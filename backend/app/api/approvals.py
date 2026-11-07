"""Approvals router — Reviewer decision flow."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_role
from app.models.db import Approval, Review, User
from app.models.schemas import ApprovalCreate, ApprovalOut, ReviewOut
from app.services import audit_service
from app.api.reviews import _review_to_out

router = APIRouter(tags=["approvals"])


@router.post("/reviews/{review_id}/approve", response_model=ApprovalOut, status_code=status.HTTP_201_CREATED)
@router.post("/reviews/{review_id}/decision", response_model=ApprovalOut, status_code=status.HTTP_201_CREATED)
def decide_review(
    review_id: str,
    payload: ApprovalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("reviewer")),
):
    action = payload.action or payload.decision
    if action not in ("approved", "changes_requested"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Action must be 'approved' or 'changes_requested'.",
        )

    review = db.query(Review).filter(Review.id == review_id, Review.is_deleted == False).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    # Only a review with status "in_review" can be decided
    if review.status != "in_review":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot decide a review with status '{review.status}'. Only reviews in 'in_review' status can be decided.",
        )

    # A Reviewer cannot decide a review they created or submitted
    if (review.created_by and review.created_by == current_user.id) or (review.submitted_by and review.submitted_by == current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot approve or request changes on your own review.",
        )

    # "changes_requested" requires a non-empty comment
    comment_clean = (payload.comment or "").strip()
    if action == "changes_requested" and not comment_clean:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A non-empty comment is required when requesting changes.",
        )

    # Update review status
    review.status = action
    review.updated_at = datetime.utcnow()

    approval = Approval(
        id=str(uuid4()),
        review_id=review_id,
        approved_by=current_user.id,
        action=action,
        comment=comment_clean or None,
        created_at=datetime.utcnow(),
    )
    db.add(approval)
    db.commit()
    db.refresh(approval)

    # Log in audit log
    audit_service.log(
        db,
        actor_id=current_user.id,
        action=action,
        resource_type="review",
        resource_id=review_id,
        detail=comment_clean or f"Review marked as {action}",
    )

    reviewer_name = current_user.full_name or current_user.email

    return ApprovalOut(
        id=approval.id,
        review_id=approval.review_id,
        approved_by=approval.approved_by,
        action=approval.action,
        decision=approval.action,
        reviewer_name=reviewer_name,
        comment=approval.comment,
        created_at=approval.created_at,
    )


@router.get("/approvals", response_model=list[ReviewOut])
def list_approvals(
    status: Optional[str] = "in_review",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("reviewer")),
):
    """Return submitted reviews for Reviewer queue, newest first, filtered by status."""
    query = db.query(Review).filter(Review.is_deleted == False)

    if status and status != "all":
        query = query.filter(Review.status == status)
    else:
        query = query.filter(Review.status.in_(["in_review", "approved", "changes_requested"]))

    reviews = query.order_by(Review.updated_at.desc(), Review.created_at.desc()).all()
    return [_review_to_out(r, db) for r in reviews]


# Backwards compatibility alias
approve_review = decide_review
