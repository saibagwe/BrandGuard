"""Tests for /api/status endpoint logic and guidelines CRUD endpoints and permissions."""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.db import User, GuidelineDoc, AuditLog
from app.models.schemas import GuidelineDocCreate, GuidelineDocUpdate
from app.main import status_check
from app.api.guidelines import create_guideline, list_guidelines, get_guideline, update_guideline, delete_guideline
from app.dependencies import require_role


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()

    admin = User(
        id="admin-001",
        email="admin@nimbus.bank",
        hashed_password="pw",
        role="admin",
        full_name="Admin User",
        is_active=True,
    )
    creator = User(
        id="creator-001",
        email="creator@nimbus.bank",
        hashed_password="pw",
        role="creator",
        full_name="Creator User",
        is_active=True,
    )
    session.add_all([admin, creator])
    session.commit()

    try:
        yield session, admin, creator
    finally:
        session.close()


def test_status_endpoint(test_db):
    """GET /api/status logic reports db_reachable and llm_key_configured without secrets."""
    db, admin, creator = test_db
    res = status_check(db=db)
    assert res["status"] == "ok"
    assert res["db_reachable"] is True
    assert isinstance(res["llm_key_configured"], bool)
    # Ensure no secrets leak
    res_str = str(res).lower()
    assert "secret" not in res_str
    assert "password" not in res_str
    assert "token" not in res_str


def test_guidelines_crud_admin(test_db):
    """Admin can create, list, update, and delete guidelines with audit logging."""
    db, admin, creator = test_db

    # 1. Create with normalized doc_type (e.g. brand-voice -> voice)
    create_payload = GuidelineDocCreate(
        title="Summer Campaign Guidelines",
        doc_type="brand-voice",
        content_text="Keep tone welcoming and professional.",
    )
    doc_out = create_guideline(payload=create_payload, db=db, current_user=admin)
    assert doc_out.title == "Summer Campaign Guidelines"
    assert doc_out.doc_type == "voice"  # normalized

    # Verify audit log was created
    audit_entry = db.query(AuditLog).filter(
        AuditLog.action == "create",
        AuditLog.resource_id == doc_out.id,
    ).first()
    assert audit_entry is not None
    assert audit_entry.actor_id == admin.id

    # 2. List guidelines
    all_docs = list_guidelines(db=db, current_user=admin)
    assert any(d.id == doc_out.id for d in all_docs)

    # 3. Get single guideline
    fetched = get_guideline(doc_id=doc_out.id, db=db, current_user=admin)
    assert fetched.id == doc_out.id

    # 4. Update guideline
    update_payload = GuidelineDocUpdate(
        title="Updated Summer Guidelines",
        doc_type="terminology",
        content_text="Banned words: awesome, super.",
    )
    updated = update_guideline(doc_id=doc_out.id, payload=update_payload, db=db, current_user=admin)
    assert updated.title == "Updated Summer Guidelines"
    assert updated.doc_type == "terminology"

    # Verify audit log for update
    update_audit = db.query(AuditLog).filter(
        AuditLog.action == "update",
        AuditLog.resource_id == doc_out.id,
    ).first()
    assert update_audit is not None

    # 5. Delete guideline
    del_res = delete_guideline(doc_id=doc_out.id, db=db, current_user=admin)
    assert del_res["status"] == "deleted"

    # Verify doc is gone
    with pytest.raises(HTTPException) as exc_info:
        get_guideline(doc_id=doc_out.id, db=db, current_user=admin)
    assert exc_info.value.status_code == 404

    # Verify audit log for delete
    del_audit = db.query(AuditLog).filter(
        AuditLog.action == "delete",
        AuditLog.resource_id == doc_out.id,
    ).first()
    assert del_audit is not None


def test_guidelines_permissions(test_db):
    """Admin role check blocks creator from accessing admin endpoints."""
    db, admin, creator = test_db

    admin_checker = require_role("admin")

    # Creator user should be denied access with 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        admin_checker(current_user=creator)
    assert exc_info.value.status_code == 403

    # Admin user is allowed
    allowed_user = admin_checker(current_user=admin)
    assert allowed_user.id == admin.id
