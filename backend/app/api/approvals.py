"""Approvals router."""
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.db import Approval, Review, User
from app.models.schemas import ApprovalCreate, ApprovalOut, ReviewOut
from app.services import audit_service
from app.api.reviews import _review_to_out

router = APIRouter(tags=["approvals"])


@router.post("/reviews/{review_id}/approve", response_model=ApprovalOut, status_code=status.HTTP_201_CREATED)
@router.post("/reviews/{review_id}/decision", response_model=ApprovalOut, status_code=status.HTTP_201_CREATED)
def approve_review(
    review_id: str,
    payload: ApprovalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("reviewer")),
):
    action = payload.action or payload.decision or "approved"
    if action not in ("approved", "changes_requested"):
        action = "approved"

    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.status not in ("in_review", "changes_requested", "draft"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve a review with status '{review.status}'",
        )

    # Update review status
    if action == "approved":
        review.status = "approved"
    else:
        review.status = "changes_requested"
    review.updated_at = datetime.utcnow()

    approval = Approval(
        id=str(uuid4()),
        review_id=review_id,
        approved_by=current_user.id,
        action=action,
        comment=payload.comment,
        created_at=datetime.utcnow(),
    )
    db.add(approval)
    db.commit()
    db.refresh(approval)

    audit_service.log(
        db,
        current_user.id,
        action,
        "review",
        review_id,
        detail=payload.comment,
    )

    return ApprovalOut(
        id=approval.id,
        review_id=approval.review_id,
        approved_by=approval.approved_by,
        action=approval.action,
        comment=approval.comment,
        created_at=approval.created_at,
    )


@router.get("/approvals", response_model=list[ReviewOut])
def list_pending_approvals(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("reviewer")),
):
    """Return reviews currently in_review status (pending approval)."""
    reviews = db.query(Review).filter(Review.status == "in_review").all()
    return [_review_to_out(r, db) for r in reviews]
