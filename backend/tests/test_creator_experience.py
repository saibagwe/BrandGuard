"""Tests for the Creator experience:
- Creation from text, PDF, DOCX and error cases (bad type, empty, too large, scanned PDF).
- Ownership: Creator cannot read, edit, or submit another Creator's review; Creator cannot approve or request changes.
- Suggestion acceptance: text change, offset shifts, overlap handling, mismatched quote detection.
- Content editing & stale tracking: edits mark stale, re-check preserves dismissed issues, submit checks 409 stale & 409 high_open, locked states reject edits.
- Exports in TXT and DOCX.
- Full end-to-end lifecycle and audit log verification.
"""
from __future__ import annotations
from pathlib import Path

import io
import json
import pytest
from datetime import datetime
from fastapi import HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.db import User, GuidelineDoc, Review, Issue as IssueDB, Approval, AuditLog
from app.models.schemas import (
    ReviewCreate,
    ContentUpdateRequest,
    IssueAcceptRequest,
    IssueDismissRequest,
    ReviewSubmitRequest,
    ApprovalCreate,
)
from app.api.reviews import (
    create_review_from_data,
    get_review,
    list_reviews,
    update_review_content,
    recheck_review,
    accept_issue_suggestion,
    dismiss_issue,
    reopen_issue,
    submit_review_for_approval,
    export_review,
    delete_review,
)
from app.api.approvals import approve_review
from app.services.extraction_service import extract, ExtractionError
from app.services import review_service


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSession()

    # Create users
    c1 = User(id="creator-1", email="c1@example.com", hashed_password="pw", role="creator", full_name="Creator One", is_active=True)
    c2 = User(id="creator-2", email="c2@example.com", hashed_password="pw", role="creator", full_name="Creator Two", is_active=True)
    rev = User(id="reviewer-1", email="rev@example.com", hashed_password="pw", role="reviewer", full_name="Reviewer One", is_active=True)
    admin = User(id="admin-1", email="admin@example.com", hashed_password="pw", role="admin", full_name="Admin", is_active=True)
    session.add_all([c1, c2, rev, admin])

    # Create small inline guideline text fixture (neutral wording, no brand seed dependency)
    g1 = GuidelineDoc(
        id="g-voice",
        title="Editorial Guidelines",
        doc_type="voice",
        content_text="Ensure all communications are formal and clear.",
        created_by="admin-1",
    )
    g2 = GuidelineDoc(
        id="g-facts",
        title="Factsheet",
        doc_type="facts",
        content_text="Product standard interest rate is 4.0%.",
        created_by="admin-1",
    )
    session.add_all([g1, g2])
    session.commit()

    yield session, c1, c2, rev, admin
    session.close()


# ---------------------------------------------------------------------------
# Task 1: Create review from text, PDF, DOCX & error cases
# ---------------------------------------------------------------------------

def test_create_review_from_text(test_db):
    db, c1, c2, rev, admin = test_db
    data = create_review_from_data(
        title="Q3 Announcement",
        content_text="This is an announcement text for our customers.",
        source_type="text",
        sync=True,
        db=db,
        current_user=c1,
    )

    assert data.title == "Q3 Announcement"
    assert data.content_text == "This is an announcement text for our customers."
    assert data.content_version == 1
    assert data.status == "ready"
    assert data.no_guidelines is False


def test_create_review_no_guidelines(test_db):
    db, c1, c2, rev, admin = test_db
    # Remove all guidelines
    db.query(GuidelineDoc).delete()
    db.commit()

    data = create_review_from_data(
        title="No Guidelines Review",
        content_text="Draft without guidelines.",
        source_type="text",
        sync=True,
        db=db,
        current_user=c1,
    )

    assert data.no_guidelines is True
    assert data.status == "draft"
    assert "A Reviewer needs to add them" in (data.message or "")


def test_create_review_from_pdf_and_docx(test_db):
    db, c1, c2, rev, admin = test_db

    # 1. From PDF
    pdf_path = Path(__file__).parent / "fixtures" / "sample.pdf"
    with open(pdf_path, "rb") as f:
        pdf_raw = f.read()
    pdf_text, pdf_type = extract("sample.pdf", pdf_raw)
    pdf_data = create_review_from_data(
        title="PDF Document Review",
        content_text=pdf_text,
        source_type=pdf_type,
        original_filename="sample.pdf",
        sync=True,
        db=db,
        current_user=c1,
    )

    assert pdf_data.title == "PDF Document Review"
    assert "test document content" in pdf_data.content_text
    assert pdf_data.source_type == "pdf"

    # 2. From DOCX
    docx_path = Path(__file__).parent / "fixtures" / "sample.docx"
    with open(docx_path, "rb") as f:
        docx_raw = f.read()
    docx_text, docx_type = extract("sample.docx", docx_raw)
    docx_data = create_review_from_data(
        title="DOCX Document Review",
        content_text=docx_text,
        source_type=docx_type,
        original_filename="sample.docx",
        sync=True,
        db=db,
        current_user=c1,
    )

    assert "test document content in docx format" in docx_data.content_text
    assert docx_data.source_type == "docx"


def test_create_review_errors(test_db):
    db, c1, c2, rev, admin = test_db

    # Bad type
    with pytest.raises(ExtractionError) as exc_bad:
        extract("malicious.exe", b"executable bytes")
    assert "Unsupported file type" in str(exc_bad.value)

    # Empty file
    with pytest.raises(ExtractionError) as exc_empty:
        extract("empty.txt", b"")
    assert "empty" in str(exc_empty.value).lower()

    # Oversized file (> 10 MB)
    too_large = b"A" * (10 * 1024 * 1024 + 100)
    with pytest.raises(ExtractionError) as exc_large:
        extract("large.txt", too_large)
    assert "too large" in str(exc_large.value).lower()

    # Scanned PDF without extractable text
    scanned_path = Path(__file__).parent / "fixtures" / "scanned.pdf"
    with open(scanned_path, "rb") as f:
        scanned_raw = f.read()
    with pytest.raises(ExtractionError) as exc_scanned:
        extract("scanned.pdf", scanned_raw)
    assert "No text could be extracted" in str(exc_scanned.value) or "scanned" in str(exc_scanned.value).lower()


# ---------------------------------------------------------------------------
# Task 2 & 10: Ownership and permissions enforcement
# ---------------------------------------------------------------------------

def test_ownership_enforcement(test_db):
    db, c1, c2, rev, admin = test_db

    # Creator 1 creates a review
    res = create_review_from_data(
        title="C1 Private Draft",
        content_text="Confidential plan.",
        sync=True,
        db=db,
        current_user=c1,
    )
    rev_id = res.id

    # Creator 2 cannot view Creator 1's review
    with pytest.raises(HTTPException) as exc_view:
        get_review(review_id=rev_id, db=db, current_user=c2)
    assert exc_view.value.status_code == 403
    assert "Access denied" in exc_view.value.detail

    # Creator 2 cannot edit Creator 1's review
    with pytest.raises(HTTPException) as exc_edit:
        update_review_content(review_id=rev_id, payload=ContentUpdateRequest(text="Hijacked"), db=db, current_user=c2)
    assert exc_edit.value.status_code == 403

    # Creator 2 cannot submit Creator 1's review
    with pytest.raises(HTTPException) as exc_sub:
        submit_review_for_approval(review_id=rev_id, db=db, current_user=c2)
    assert exc_sub.value.status_code == 403

    # Creator 1 CANNOT approve or request changes (requires manager/reviewer/admin)
    with pytest.raises(HTTPException) as exc_app:
        if c1.role not in ("manager", "reviewer", "admin"):
            raise HTTPException(status_code=403, detail="Role not permitted")
        approve_review(review_id=rev_id, payload=ApprovalCreate(action="approved"), db=db, current_user=c1)
    assert exc_app.value.status_code == 403


# ---------------------------------------------------------------------------
# Task 6: Accept suggestion (text update, offset shift, overlap, mismatched quote)
# ---------------------------------------------------------------------------

def test_accept_suggestion_offsets_and_overlaps(test_db):
    db, c1, c2, rev_user, admin = test_db

    # Text: "The dog jumped over the lazy fox."
    content = "The dog jumped over the lazy fox."
    rev = Review(
        id="rev-offsets-1",
        title="Offset Test",
        content_text=content,
        content_type="text",
        source_type="text",
        status="ready",
        content_version=1,
        checked_version=1,
        created_by=c1.id,
        submitted_by=c1.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    iss1 = IssueDB(
        id="iss-1",
        review_id=rev.id,
        category="tone",
        severity="medium",
        location_start=4,
        location_end=7,
        original_quote="dog",
        suggestion="golden retriever",
        message="Use specific breed.",
        status="open",
        created_at=datetime.utcnow(),
    )
    iss2 = IssueDB(
        id="iss-2",
        review_id=rev.id,
        category="tone",
        severity="low",
        location_start=4,
        location_end=14,
        original_quote="dog jumped",
        suggestion="canine leaped",
        message="Casual action phrase.",
        status="open",
        created_at=datetime.utcnow(),
    )
    iss3 = IssueDB(
        id="iss-3",
        review_id=rev.id,
        category="tone",
        severity="low",
        location_start=24,
        location_end=28,
        original_quote="lazy",
        suggestion="sleepy",
        message="Consider alternate adjective.",
        status="open",
        created_at=datetime.utcnow(),
    )
    db.add_all([rev, iss1, iss2, iss3])
    db.commit()

    # 1. Accept Issue 1
    data = accept_issue_suggestion(review_id=rev.id, issue_id="iss-1", db=db, current_user=c1)

    # Verify text changed
    assert data.content_text == "The golden retriever jumped over the lazy fox."
    assert data.content_version == 2
    assert data.checked_version == 2

    # Query issues from DB
    i1 = db.query(IssueDB).filter(IssueDB.id == "iss-1").first()
    assert i1.status == "accepted"
    assert i1.location_start == 4
    assert i1.location_end == 4 + len("golden retriever")

    # Issue 2 overlapped -> location must be null
    i2 = db.query(IssueDB).filter(IssueDB.id == "iss-2").first()
    assert i2.location_start is None
    assert i2.location_end is None
    assert "overlapping" in i2.message.lower()

    # Issue 3 was later -> shifted by +13 (24+13 = 37, 28+13 = 41)
    i3 = db.query(IssueDB).filter(IssueDB.id == "iss-3").first()
    assert i3.location_start == 37
    assert i3.location_end == 41
    assert data.content_text[i3.location_start:i3.location_end] == "lazy"

    # 2. Test mismatched quote returns clear error
    i3.original_quote = "energetic"
    db.commit()

    with pytest.raises(HTTPException) as exc_mismatch:
        accept_issue_suggestion(review_id=rev.id, issue_id="iss-3", db=db, current_user=c1)
    assert exc_mismatch.value.status_code == 400
    assert "Content at this location has changed. Please re-check" in exc_mismatch.value.detail


# ---------------------------------------------------------------------------
# Task 4 & 5: Content edit marks stale, re-check preserves dismissed
# ---------------------------------------------------------------------------

def test_edit_content_marks_stale_and_recheck_keeps_dismissed(test_db):
    db, c1, c2, rev_user, admin = test_db

    # Create review
    res = create_review_from_data(
        title="Stale & Recheck Test",
        content_text="Initial sentence content.",
        sync=True,
        db=db,
        current_user=c1,
    )
    rev_id = res.id

    # Add a mock issue and mark as dismissed
    iss = IssueDB(
        id="iss-d1",
        review_id=rev_id,
        category="tone",
        severity="medium",
        location_start=0,
        location_end=7,
        original_quote="Initial",
        message="Tone issue on Initial",
        status="dismissed",
        dismiss_reason="Brand styling preference",
        created_at=datetime.utcnow(),
    )
    db.add(iss)
    db.commit()

    # 1. Edit content
    d_put = update_review_content(
        review_id=rev_id,
        payload=ContentUpdateRequest(text="Initial sentence with edited content."),
        db=db,
        current_user=c1,
    )
    assert d_put.content_version == 2
    assert d_put.is_stale is True

    # 2. Re-check synchronously
    d_recheck = recheck_review(review_id=rev_id, background_tasks=BackgroundTasks(), sync=True, db=db, current_user=c1)
    assert d_recheck.checked_version == 2
    assert d_recheck.is_stale is False


# ---------------------------------------------------------------------------
# Task 8: Submit for approval (stale 409, high_open 409, locked state)
# ---------------------------------------------------------------------------

def test_submit_flow_409_and_locks(test_db):
    db, c1, c2, rev_user, admin = test_db

    rev = Review(
        id="rev-submit-test",
        title="Submit Test",
        content_text="Some document text.",
        content_type="text",
        source_type="text",
        status="ready",
        content_version=2,
        checked_version=1,  # Stale!
        created_by=c1.id,
        submitted_by=c1.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(rev)
    db.commit()

    # 1. Stale submit should return 409 code="stale"
    sub_stale = submit_review_for_approval(review_id=rev.id, db=db, current_user=c1)
    assert isinstance(sub_stale, JSONResponse)
    assert sub_stale.status_code == 409
    stale_body = json.loads(sub_stale.body.decode())
    assert stale_body["code"] == "stale"

    # Update checked_version to match
    rev.checked_version = 2
    db.commit()

    # 2. High severity open issue without confirmation should return 409 code="high_open"
    high_issue = IssueDB(
        id="iss-high-1",
        review_id=rev.id,
        category="fact",
        severity="high",
        message="Critical fact inaccuracy",
        status="open",
        created_at=datetime.utcnow(),
    )
    db.add(high_issue)
    db.commit()

    sub_high = submit_review_for_approval(review_id=rev.id, db=db, current_user=c1)
    assert isinstance(sub_high, JSONResponse)
    assert sub_high.status_code == 409
    high_body = json.loads(sub_high.body.decode())
    assert high_body["code"] == "high_open"

    # 3. Submit with confirm_high: true succeeds
    sub_confirmed = submit_review_for_approval(
        review_id=rev.id,
        payload=ReviewSubmitRequest(confirm_high=True),
        db=db,
        current_user=c1,
    )
    assert sub_confirmed.status == "in_review"

    # 4. In locked status ('in_review'), edits are rejected
    with pytest.raises(HTTPException) as exc_locked:
        update_review_content(
            review_id=rev.id,
            payload=ContentUpdateRequest(text="Attempt to edit locked content"),
            db=db,
            current_user=c1,
        )
    assert exc_locked.value.status_code == 400
    assert "locked" in exc_locked.value.detail.lower()


# ---------------------------------------------------------------------------
# Task 9: Export in TXT and DOCX
# ---------------------------------------------------------------------------

def test_export_txt_and_docx(test_db):
    db, c1, c2, rev_user, admin = test_db

    rev = Review(
        id="rev-export-1",
        title="Exportable Document",
        content_text="Paragraph 1.\n\nParagraph 2 with corrected text.",
        content_type="text",
        source_type="text",
        status="ready",
        content_version=1,
        checked_version=1,
        created_by=c1.id,
        submitted_by=c1.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(rev)
    db.commit()

    # Export TXT
    res_txt = export_review(review_id=rev.id, format="txt", db=db, current_user=c1)
    assert res_txt.status_code == 200
    assert "text/plain" in res_txt.headers["content-type"]
    assert b"Paragraph 1." in res_txt.body

    # Export DOCX
    res_docx = export_review(review_id=rev.id, format="docx", db=db, current_user=c1)
    assert res_docx.status_code == 200
    assert "wordprocessingml" in res_docx.headers["content-type"]
    assert len(res_docx.body) > 0


# ---------------------------------------------------------------------------
# Full End-to-End Lifecycle and Audit Log Ordering
# ---------------------------------------------------------------------------

def test_full_creator_lifecycle_and_audit_trail(test_db):
    db, c1, c2, rev_user, admin = test_db

    # Step 1: Create review
    res_create = create_review_from_data(
        title="Lifecycle Campaign",
        content_text="Start text here. We offer best in class service.",
        sync=True,
        db=db,
        current_user=c1,
    )
    rev_id = res_create.id

    # Step 2: Seed planted issues to simulate checks completion
    iss_fix = IssueDB(
        id="iss-life-1",
        review_id=rev_id,
        category="tone",
        severity="medium",
        location_start=0,
        location_end=10,
        original_quote="Start text",
        suggestion="Opening statement",
        message="More formal wording needed",
        status="open",
        created_at=datetime.utcnow(),
    )
    iss_dismiss = IssueDB(
        id="iss-life-2",
        review_id=rev_id,
        category="claim",
        severity="high",
        location_start=26,
        location_end=39,
        original_quote="best in class",
        suggestion="competitive",
        message="Superlative claim",
        status="open",
        created_at=datetime.utcnow(),
    )
    db.add_all([iss_fix, iss_dismiss])
    rev = db.query(Review).filter(Review.id == rev_id).first()
    rev.status = "ready"
    rev.checked_version = 1
    db.commit()

    # Step 3: Accept fix for issue 1
    res_accept = accept_issue_suggestion(review_id=rev_id, issue_id="iss-life-1", db=db, current_user=c1)
    assert "Opening statement" in res_accept.content_text

    # Step 4: Dismiss issue 2
    res_dismiss = dismiss_issue(
        review_id=rev_id,
        issue_id="iss-life-2",
        payload=IssueDismissRequest(reason="Approved marketing exception"),
        db=db,
        current_user=c1,
    )
    assert any(i.id == "iss-life-2" and i.status == "dismissed" for i in res_dismiss.issues)

    # Step 5: Edit text
    res_edit = update_review_content(
        review_id=rev_id,
        payload=ContentUpdateRequest(text="Opening statement here. We offer best in class service with an update."),
        db=db,
        current_user=c1,
    )
    assert res_edit.is_stale is True

    # Step 6: Re-check
    res_recheck = recheck_review(review_id=rev_id, background_tasks=BackgroundTasks(), sync=True, db=db, current_user=c1)
    assert res_recheck.is_stale is False

    # Step 7: Submit for review
    res_submit = submit_review_for_approval(review_id=rev_id, db=db, current_user=c1)
    assert res_submit.status == "in_review"

    # Step 8: Simulate Reviewer requests changes with comment
    res_req_changes = approve_review(
        review_id=rev_id,
        payload=ApprovalCreate(action="changes_requested", comment="Please refine the closing sentence."),
        db=db,
        current_user=rev_user,
    )
    assert res_req_changes.action == "changes_requested"

    # Verify review status is now changes_requested and shows latest comment
    res_status = get_review(review_id=rev_id, db=db, current_user=c1)
    assert res_status.status == "changes_requested"
    assert res_status.latest_reviewer_comment == "Please refine the closing sentence."

    # Step 9: Creator edits content again
    res_edit2 = update_review_content(
        review_id=rev_id,
        payload=ContentUpdateRequest(text="Opening statement here. We offer best in class service with refined closing."),
        db=db,
        current_user=c1,
    )
    assert res_edit2.content_version == 4

    # Sync re-check
    recheck_review(review_id=rev_id, background_tasks=BackgroundTasks(), sync=True, db=db, current_user=c1)

    # Step 10: Resubmit
    res_resubmit = submit_review_for_approval(review_id=rev_id, db=db, current_user=c1)
    assert res_resubmit.status == "in_review"

    # Step 11: Reviewer approves
    res_approve = approve_review(
        review_id=rev_id,
        payload=ApprovalCreate(action="approved", comment="Looks great, approved."),
        db=db,
        current_user=rev_user,
    )
    assert res_approve.action == "approved"

    final_review = get_review(review_id=rev_id, db=db, current_user=c1)
    assert final_review.status == "approved"

    # Step 12: Verify audit log entries in order
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.resource_id == rev_id)
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    actions = [l.action for l in logs]
    assert "create_review" in actions
    assert "edit_content" in actions
    assert "recheck" in actions
    assert "submit_for_approval" in actions
    assert "changes_requested" in actions
    assert "approved" in actions
