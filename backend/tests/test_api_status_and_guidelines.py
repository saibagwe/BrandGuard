"""Tests for /api/status endpoint logic, guidelines read endpoints, and role permissions."""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.db import User, GuidelineDoc
from app.main import status_check
from app.api.guidelines import list_guidelines, get_guideline
from app.dependencies import require_role


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()

    reviewer = User(
        id="reviewer-001",
        email="reviewer@nimbus.bank",
        hashed_password="pw",
        role="reviewer",
        full_name="Reviewer User",
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
    session.add_all([reviewer, creator])
    session.commit()

    try:
        yield session, reviewer, creator
    finally:
        session.close()


def test_status_endpoint(test_db):
    """GET /api/status logic reports db_reachable and llm_key_configured without secrets."""
    db, reviewer, creator = test_db
    res = status_check(db=db)
    assert res["status"] == "ok"
    assert res["db_reachable"] is True
    assert isinstance(res["llm_key_configured"], bool)
    # Ensure no secrets leak
    res_str = str(res).lower()
    assert "secret" not in res_str
    assert "password" not in res_str
    assert "token" not in res_str


def test_guidelines_read(test_db):
    """Authenticated users can read guideline documents."""
    db, reviewer, creator = test_db

    doc = GuidelineDoc(
        id="guide-001",
        title="Voice Guide",
        doc_type="voice",
        content_text="Warm and professional brand tone.",
        created_by=reviewer.id,
    )
    db.add(doc)
    db.commit()

    # Creator lists guidelines
    all_docs = list_guidelines(db=db, current_user=creator)
    assert any(d.id == doc.id for d in all_docs)

    # Reviewer fetches single guideline
    fetched = get_guideline(doc_id=doc.id, db=db, current_user=reviewer)
    assert fetched.id == doc.id
    assert fetched.title == "Voice Guide"


def test_role_permissions(test_db):
    """Reviewer role is allowed for reviewer endpoints; creator is blocked."""
    db, reviewer, creator = test_db

    reviewer_checker = require_role("reviewer")

    # Creator user should be denied access with 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        reviewer_checker(current_user=creator)
    assert exc_info.value.status_code == 403

    # Reviewer user is allowed
    allowed_user = reviewer_checker(current_user=reviewer)
    assert allowed_user.id == reviewer.id


def test_removed_roles_blocked(test_db):
    """Manager and Admin roles are completely removed and blocked."""
    db, reviewer, creator = test_db

    # User with manager role
    manager_user = User(
        id="mgr-001",
        email="manager@nimbus.bank",
        hashed_password="pw",
        role="manager",
        full_name="Manager User",
        is_active=True,
    )
    # User with admin role
    admin_user = User(
        id="adm-001",
        email="admin@nimbus.bank",
        hashed_password="pw",
        role="admin",
        full_name="Admin User",
        is_active=True,
    )

    creator_checker = require_role("creator")
    reviewer_checker = require_role("reviewer")

    for user in [manager_user, admin_user]:
        with pytest.raises(HTTPException) as exc:
            creator_checker(current_user=user)
        assert exc.value.status_code == 403

        with pytest.raises(HTTPException) as exc:
            reviewer_checker(current_user=user)
        assert exc.value.status_code == 403
