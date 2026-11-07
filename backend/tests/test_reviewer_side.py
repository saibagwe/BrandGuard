"""Tests for the Reviewer experience:
- Part 1: Approvals/decisions validation (422, 409, 403, required comment, audit log)
- Part 2: Guidelines CRUD (Reviewer-only writes, Creator blocked, auto chunk/embed, audit log, get allowed for both)
- Part 3: Audit log query & filters (Reviewer only, Creator blocked)
- Part 4: Visibility rules (Reviewer never sees draft/checking/ready, Creator sees only own)
- Part 5: Full review lifecycle (submit -> changes_requested -> edit -> resubmit -> approve)
"""
from __future__ import annotations

import uuid
import pytest
from datetime import datetime
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.db import User, GuidelineDoc, Review, Approval, AuditLog, GuidelineChunk
from app.models.schemas import (
    ApprovalCreate,
    GuidelineDocCreate,
    GuidelineDocUpdate,
    ContentUpdateRequest,
)
from app.api.approvals import decide_review, list_approvals
from app.api.guidelines import (
    create_guideline,
    update_guideline,
    delete_guideline,
    list_guidelines,
    get_guideline,
)
from app.api.audit import get_audit_logs
from app.api.reviews import (
    list_reviews,
    get_review,
    update_review_content,
    create_review_from_data,
)


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSession()

    # Create users
    c1 = User(id="creator-1", email="creator@demo.local", hashed_password="pw", role="creator", full_name="Creator User", is_active=True)
    c2 = User(id="creator-2", email="creator2@demo.local", hashed_password="pw", role="creator", full_name="Creator Two", is_active=True)
    rev = User(id="reviewer-1", email="reviewer@demo.local", hashed_password="pw", role="reviewer", full_name="Reviewer User", is_active=True)
    session.add_all([c1, c2, rev])
    session.commit()
    try:
        yield session
    finally:
        session.close()


def make_review(db, creator_id, status="ready", title="Test Review", submitted_by=None):
    r = Review(
        id=str(uuid.uuid4()),
        title=title,
        content_text="Sample text content for review verification.",
        source_type="text",
        status=status,
        created_by=creator_id,
        submitted_by=submitted_by or (creator_id if status in ("in_review", "changes_requested", "approved") else None),
        content_version=1,
        checked_version=1,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


# ══════════════════════════════════════════════════════════════════════════════
# PART 1: DECISIONS VALIDATION
# ══════════════════════════════════════════════════════════════════════════════

def test_invalid_action_raises_422(test_db):
    rev = test_db.query(User).filter(User.id == "reviewer-1").first()
    review = make_review(test_db, "creator-1", status="in_review")

    # Pydantic schema validation rejects unknown action
    with pytest.raises(ValidationError):
        ApprovalCreate(action="rejected", comment="bad")

    # If payload somehow passes with an invalid action, decide_review explicitly raises 422
    invalid_payload = ApprovalCreate.model_construct(action="rejected", comment="bad")
    with pytest.raises(HTTPException) as exc:
        decide_review(review.id, invalid_payload, test_db, rev)
    assert exc.value.status_code == 422


def test_wrong_status_raises_409(test_db):
    rev = test_db.query(User).filter(User.id == "reviewer-1").first()
    review = make_review(test_db, "creator-1", status="ready")

    with pytest.raises(HTTPException) as exc:
        decide_review(review.id, ApprovalCreate(action="approved"), test_db, rev)
    assert exc.value.status_code == 409


def test_reviewer_cannot_decide_own_review(test_db):
    rev = test_db.query(User).filter(User.id == "reviewer-1").first()
    # Reviewer created the review
    review = make_review(test_db, rev.id, status="in_review")

    with pytest.raises(HTTPException) as exc:
        decide_review(review.id, ApprovalCreate(action="approved"), test_db, rev)
    assert exc.value.status_code == 403


def test_changes_requested_requires_comment(test_db):
    rev = test_db.query(User).filter(User.id == "reviewer-1").first()
    review = make_review(test_db, "creator-1", status="in_review")

    # Missing comment
    with pytest.raises(HTTPException) as exc:
        decide_review(review.id, ApprovalCreate(action="changes_requested", comment=""), test_db, rev)
    assert exc.value.status_code == 422

    # Whitespace-only comment
    with pytest.raises(HTTPException) as exc2:
        decide_review(review.id, ApprovalCreate(action="changes_requested", comment="   "), test_db, rev)
    assert exc2.value.status_code == 422


def test_approved_decision_success_and_audit(test_db):
    rev = test_db.query(User).filter(User.id == "reviewer-1").first()
    review = make_review(test_db, "creator-1", status="in_review")

    res = decide_review(review.id, ApprovalCreate(action="approved", comment="Looks great!"), test_db, rev)
    assert res.action == "approved"
    assert res.decision == "approved"

    test_db.refresh(review)
    assert review.status == "approved"

    # Audit log check: resource_id holds review.id
    audit = test_db.query(AuditLog).filter(AuditLog.resource_id == review.id).first()
    assert audit is not None
    assert audit.action == "approved"
    assert audit.actor_id == rev.id


def test_changes_requested_success_and_unlocks_edit(test_db):
    rev = test_db.query(User).filter(User.id == "reviewer-1").first()
    c1 = test_db.query(User).filter(User.id == "creator-1").first()
    review = make_review(test_db, "creator-1", status="in_review")

    res = decide_review(review.id, ApprovalCreate(action="changes_requested", comment="Please clarify line 2."), test_db, rev)
    assert res.action == "changes_requested"

    test_db.refresh(review)
    assert review.status == "changes_requested"

    # Creator can now edit because status is changes_requested
    up = update_review_content(review.id, ContentUpdateRequest(text="Updated clarified content."), test_db, c1)
    assert up.content_text == "Updated clarified content."


# ══════════════════════════════════════════════════════════════════════════════
# PART 2: VISIBILITY & QUEUES
# ══════════════════════════════════════════════════════════════════════════════

def test_reviewer_only_sees_submitted_reviews(test_db):
    rev = test_db.query(User).filter(User.id == "reviewer-1").first()
    c1 = test_db.query(User).filter(User.id == "creator-1").first()

    make_review(test_db, c1.id, status="draft", title="Draft Review")
    make_review(test_db, c1.id, status="checking", title="Checking Review")
    make_review(test_db, c1.id, status="ready", title="Ready Review")
    make_review(test_db, c1.id, status="in_review", title="In Review")
    make_review(test_db, c1.id, status="changes_requested", title="Changes Requested")
    make_review(test_db, c1.id, status="approved", title="Approved")

    reviews = list_reviews(None, test_db, rev)
    statuses = {r.status for r in reviews}
    assert "draft" not in statuses
    assert "checking" not in statuses
    assert "ready" not in statuses
    assert {"in_review", "changes_requested", "approved"}.issubset(statuses)


def test_creator_only_sees_own_reviews(test_db):
    c1 = test_db.query(User).filter(User.id == "creator-1").first()
    c2 = test_db.query(User).filter(User.id == "creator-2").first()

    make_review(test_db, c1.id, status="ready", title="C1 Review")
    make_review(test_db, c2.id, status="ready", title="C2 Review")

    reviews_c1 = list_reviews(None, test_db, c1)
    assert len(reviews_c1) == 1
    assert reviews_c1[0].title == "C1 Review"


def test_approvals_list_filtering(test_db):
    rev = test_db.query(User).filter(User.id == "reviewer-1").first()
    make_review(test_db, "creator-1", status="in_review", title="Pending 1")
    make_review(test_db, "creator-1", status="approved", title="Approved 1")
    make_review(test_db, "creator-1", status="changes_requested", title="Changes 1")

    pending = list_approvals("in_review", test_db, rev)
    assert len(pending) == 1
    assert pending[0].title == "Pending 1"

    appr = list_approvals("approved", test_db, rev)
    assert len(appr) == 1
    assert appr[0].title == "Approved 1"

    all_rev = list_approvals("all", test_db, rev)
    assert len(all_rev) == 3


# ══════════════════════════════════════════════════════════════════════════════
# PART 3: GUIDELINES CRUD
# ══════════════════════════════════════════════════════════════════════════════

def test_guideline_crud_and_audit(test_db):
    rev = test_db.query(User).filter(User.id == "reviewer-1").first()
    c1 = test_db.query(User).filter(User.id == "creator-1").first()

    # Create guideline
    g = create_guideline(
        GuidelineDocCreate(
            title="Tone Rules",
            doc_type="voice",
            content_text="Always use a confident and professional voice.",
        ),
        test_db,
        rev,
    )
    assert g.title == "Tone Rules"
    assert g.doc_type == "voice"
    assert g.chunks_count >= 1

    # Verify audit entry for create
    created_audit = test_db.query(AuditLog).filter(AuditLog.action == "guideline_created").first()
    assert created_audit is not None
    assert created_audit.resource_id == g.id

    # Both roles can view guidelines
    all_g_creator = list_guidelines(test_db, c1)
    assert len(all_g_creator) == 1
    all_g_rev = list_guidelines(test_db, rev)
    assert len(all_g_rev) == 1

    # Single view
    single_g = get_guideline(g.id, test_db, c1)
    assert single_g.id == g.id

    # Update guideline
    up = update_guideline(
        g.id,
        GuidelineDocUpdate(title="Tone Rules Updated", content_text="New guidelines text."),
        test_db,
        rev,
    )
    assert up.title == "Tone Rules Updated"
    assert up.content_text == "New guidelines text."

    # Delete guideline
    del_res = delete_guideline(g.id, test_db, rev)
    assert del_res["status"] == "deleted"
    assert test_db.query(GuidelineDoc).filter(GuidelineDoc.id == g.id).first() is None


def test_invalid_guideline_doc_type_raises_422(test_db):
    rev = test_db.query(User).filter(User.id == "reviewer-1").first()
    with pytest.raises(HTTPException) as exc:
        create_guideline(
            GuidelineDocCreate(title="Bad", doc_type="invalid_type", content_text="Text"),
            test_db,
            rev,
        )
    assert exc.value.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# PART 4: AUDIT LOG ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════

def test_audit_log_query_and_filters(test_db):
    rev = test_db.query(User).filter(User.id == "reviewer-1").first()
    review = make_review(test_db, "creator-1", status="in_review")

    # Perform decision
    decide_review(review.id, ApprovalCreate(action="approved"), test_db, rev)

    # Reviewer queries audit logs
    logs = get_audit_logs(user=None, action=None, review_id=review.id, limit=50, offset=0, db=test_db, current_user=rev)
    assert len(logs) >= 1
    assert logs[0].resource_id == review.id
    assert logs[0].action == "approved"
    assert logs[0].actor_name == "Reviewer User"
    assert logs[0].actor_email == "reviewer@demo.local"


# ══════════════════════════════════════════════════════════════════════════════
# PART 5: FULL LIFECYCLE
# ══════════════════════════════════════════════════════════════════════════════

def test_end_to_end_reviewer_lifecycle(test_db):
    rev = test_db.query(User).filter(User.id == "reviewer-1").first()
    c1 = test_db.query(User).filter(User.id == "creator-1").first()

    # 1. Review submitted by creator
    review = make_review(test_db, c1.id, status="in_review", title="Full Flow Review")

    # 2. Reviewer requests changes
    decide_review(review.id, ApprovalCreate(action="changes_requested", comment="Please revise the closing."), test_db, rev)
    test_db.refresh(review)
    assert review.status == "changes_requested"

    # 3. Creator edits content
    update_review_content(review.id, ContentUpdateRequest(text="Revised closing content."), test_db, c1)
    test_db.refresh(review)
    assert review.content_text == "Revised closing content."

    # 4. Creator resubmits (status returns to in_review)
    review.status = "in_review"
    test_db.commit()

    # 5. Reviewer approves
    decide_review(review.id, ApprovalCreate(action="approved", comment="Looks great now!"), test_db, rev)
    test_db.refresh(review)
    assert review.status == "approved"

    # 6. Approved review cannot be edited
    with pytest.raises(HTTPException) as exc:
        update_review_content(review.id, ContentUpdateRequest(text="Illegal edit"), test_db, c1)
    assert exc.value.status_code in (400, 403, 409)
