"""Idempotent seed script for BrandGuard backend.

Run from backend/ directory:
    python seed/seed.py
    python seed/seed.py --reset
"""
from __future__ import annotations

import sys
import os

# Allow imports from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime
from uuid import uuid4

import bcrypt
from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db
from app.models.db import (
    User,
    GuidelineDoc,
    GuidelineChunk,
    Review,
    Issue,
    Approval,
    AuditLog,
)

DEMO_PASSWORD = bcrypt.hashpw(b"demo1234", bcrypt.gensalt()).decode("utf-8")


def _get_or_create_user(db: Session, email: str, role: str, full_name: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user:
        # Ensure password hash is valid
        user.hashed_password = DEMO_PASSWORD
        user.role = role
        user.full_name = full_name
        user.is_active = True
        db.commit()
        return user
    user = User(
        id=str(uuid4()),
        email=email,
        hashed_password=DEMO_PASSWORD,
        role=role,
        full_name=full_name,
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"  Created user: {email} ({role})")
    return user


def reset_database(db: Session) -> None:
    """Delete all guideline documents, chunks, reviews, issues, approvals, and audit entries."""
    print("\n[Resetting database]")
    db.query(Issue).delete()
    db.query(Approval).delete()
    db.query(Review).delete()
    db.query(GuidelineChunk).delete()
    db.query(GuidelineDoc).delete()
    db.query(AuditLog).delete()
    db.commit()
    print("  Deleted all issues, approvals, reviews, guideline chunks, guideline docs, and audit logs.")


def seed() -> None:
    init_db()
    db: Session = SessionLocal()
    try:
        is_reset = "--reset" in sys.argv
        if is_reset:
            reset_database(db)

        print("\n[Users]")
        creator = _get_or_create_user(db, "creator@demo.local", "creator", "Alex Creator")
        reviewer = _get_or_create_user(db, "reviewer@demo.local", "reviewer", "Riley Reviewer")
        # Also ensure legacy demo credentials remain valid for tests
        _get_or_create_user(db, "creator@nimbus.bank", "creator", "Alex Creator (Legacy)")
        _get_or_create_user(db, "reviewer@nimbus.bank", "reviewer", "Riley Reviewer (Legacy)")

        print("\n[OK] Demo users ready:")
        print("  Creator:  creator@demo.local  / demo1234")
        print("  Reviewer: reviewer@demo.local / demo1234")
        print("  (No guideline documents, reviews, or issues seeded by default.)")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
