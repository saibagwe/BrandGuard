"""Idempotent seed script for BrandGuard backend.

Usage:
    python seed/seed.py          # Ensure four demo users exist
    python seed/seed.py --reset  # Delete all guidelines, reviews, issues, approvals, and audit logs, keeping demo users
"""
from __future__ import annotations

import sys
import os
import argparse

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

DEMO_USERS = [
    ("creator@brandguard.ai", "creator", "Alex Creator"),
    ("manager@brandguard.ai", "manager", "Sam Manager"),
    ("reviewer@brandguard.ai", "reviewer", "Riley Reviewer"),
    ("admin@brandguard.ai", "admin", "Jordan Admin"),
]


def _get_or_create_user(db: Session, email: str, role: str, full_name: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user:
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


def reset_brand_data(db: Session):
    """Delete all brand guidelines, chunks, reviews, issues, approvals, and audit logs."""
    print("Resetting seeded brand content...")
    
    deleted_audits = db.query(AuditLog).delete()
    deleted_approvals = db.query(Approval).delete()
    deleted_issues = db.query(Issue).delete()
    deleted_reviews = db.query(Review).delete()
    deleted_chunks = db.query(GuidelineChunk).delete()
    deleted_docs = db.query(GuidelineDoc).delete()
    
    # Remove any deprecated users not in current demo set
    valid_emails = [u[0] for u in DEMO_USERS]
    deleted_old_users = db.query(User).filter(User.email.notin_(valid_emails)).delete(synchronize_session=False)
    
    db.commit()
    print(
        f"  Removed: {deleted_docs} guideline docs, {deleted_chunks} chunks, "
        f"{deleted_reviews} reviews, {deleted_issues} issues, "
        f"{deleted_approvals} approvals, {deleted_audits} audit entries, "
        f"{deleted_old_users} deprecated users."
    )


def seed(reset: bool = False):
    print("Initialising database…")
    init_db()
    db = SessionLocal()

    try:
        if reset:
            reset_brand_data(db)

        print("\n[Users]")
        for email, role, full_name in DEMO_USERS:
            _get_or_create_user(db, email, role, full_name)

        print("\n[OK] Seed complete. 4 demo users ready. No seeded brand content.")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed BrandGuard AI database.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete all guidelines, reviews, issues, approvals, and audit logs, keeping only demo users.",
    )
    args = parser.parse_args()
    seed(reset=args.reset)
