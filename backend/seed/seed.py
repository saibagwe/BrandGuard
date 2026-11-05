"""Idempotent seed script for BrandGuard backend.

Run from backend/ directory:
    python seed/seed.py
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
from app.services import embedding_service

DEMO_PASSWORD = bcrypt.hashpw(b"demo1234", bcrypt.gensalt()).decode("utf-8")


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


def _get_or_create_guideline(db: Session, title: str, doc_type: str, content_text: str, created_by: str) -> GuidelineDoc:
    doc = db.query(GuidelineDoc).filter(GuidelineDoc.title == title).first()
    if doc:
        return doc
    doc = GuidelineDoc(
        id=str(uuid4()),
        title=title,
        doc_type=doc_type,
        content_text=content_text,
        created_by=created_by,
        created_at=datetime.utcnow(),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    # Embed and store chunks
    embedding_service.embed_and_store(doc, db)
    print(f"  Created guideline: {title}")
    return doc


def _add_issue(db: Session, review_id: str, **kwargs) -> Issue:
    issue = Issue(id=str(uuid4()), review_id=review_id, created_at=datetime.utcnow(), **kwargs)
    db.add(issue)
    return issue


def _get_or_create_review(
    db: Session,
    title: str,
    content_text: str,
    submitted_by: str,
    status: str,
) -> tuple[Review, bool]:
    existing = db.query(Review).filter(Review.title == title).first()
    if existing:
        return existing, False
    review = Review(
        id=str(uuid4()),
        title=title,
        content_text=content_text,
        content_type="text",
        status=status,
        submitted_by=submitted_by,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    print(f"  Created review: {title}")
    return review, True


def seed():
    print("Initialising database…")
    init_db()
    db = SessionLocal()

    try:
        # ----------------------------------------------------------------
        # 1. Users
        # ----------------------------------------------------------------
        print("\n[Users]")
        creator = _get_or_create_user(db, "creator@nimbus.bank", "creator", "Alex Creator")
        manager = _get_or_create_user(db, "manager@nimbus.bank", "manager", "Sam Manager")
        reviewer = _get_or_create_user(db, "reviewer@nimbus.bank", "reviewer", "Riley Reviewer")
        admin = _get_or_create_user(db, "admin@nimbus.bank", "admin", "Jordan Admin")

        # ----------------------------------------------------------------
        # 2. Guideline docs
        # ----------------------------------------------------------------
        print("\n[Guideline Docs]")
        voice_guide = _get_or_create_guideline(
            db,
            title="Voice Guide",
            doc_type="voice",
            content_text=(
                "Nimbus Bank Brand Voice: Professional, warm, and trustworthy. "
                "Use second-person ('you'). Avoid casual language (hey, guys, gonna, lol, awesome). "
                "Write at 8th grade reading level. Never use exclamation marks more than once per page."
            ),
            created_by=admin.id,
        )
        terminology_rules = _get_or_create_guideline(
            db,
            title="Terminology Rules",
            doc_type="terminology",
            content_text=(
                "Preferred: 'savings account' not 'savings acct'. "
                "Use 'annual percentage yield (APY)' on first mention. "
                "Banned words: awesome, guys, gonna, wanna, lol, super, hey. "
                "Product names: NimbusGrow Savings, NimbusFlex Checking, NimbusShield Credit Card."
            ),
            created_by=admin.id,
        )
        approved_facts = _get_or_create_guideline(
            db,
            title="Approved Facts",
            doc_type="facts",
            content_text=(
                "NimbusGrow Savings: 3.2% APY as of Q1 2024. "
                "NimbusFlex Checking: No monthly fees. "
                "NimbusShield Credit Card: 0% intro APR for 12 months. "
                "FDIC insured up to $250,000. Founded 1987. Headquartered in Austin, TX."
            ),
            created_by=admin.id,
        )
        visual_guidelines = _get_or_create_guideline(
            db,
            title="Visual Guidelines",
            doc_type="visual",
            content_text=(
                "Primary: #003366 (Navy), #0066CC (Blue), #FFFFFF (White). "
                "Secondary: #F5A623 (Gold), #4CAF50 (Green). "
                "Logo minimum size: 40px. Never stretch logo."
            ),
            created_by=admin.id,
        )

        # ----------------------------------------------------------------
        # 3. Reviews
        # ----------------------------------------------------------------
        print("\n[Reviews]")

        # Review 1
        review1, created1 = _get_or_create_review(
            db,
            title="Summer Savings Campaign",
            content_text=(
                "Hey guys! You're gonna love our awesome summer savings deal! "
                "Get 2.5% APY on your savings account - best in class rates that are totally "
                "unmatched in the industry! lol just kidding but seriously this is super great!"
            ),
            submitted_by=creator.id,
            status="in_review",
        )
        if created1:
            _add_issue(
                db, review1.id,
                category="tone",
                severity="high",
                location_start=0,
                location_end=9,
                message="Casual language detected ('Hey guys', 'gonna', 'awesome', 'lol', 'super'). These words violate Nimbus Bank brand voice guidelines.",
                evidence_source_doc="Terminology Rules",
                evidence_quote="Banned words: awesome, guys, gonna, wanna, lol, super, hey.",
                evidence_rule_id="TONE-001",
                suggestion="Rewrite as: 'Discover our summer savings offer. Enjoy 3.2% APY on your NimbusGrow Savings account — a rate designed to help you grow your money.'",
                status="open",
            )
            _add_issue(
                db, review1.id,
                category="fact",
                severity="high",
                location_start=72,
                location_end=82,
                message="Incorrect APY stated: '2.5% APY'. Approved fact states NimbusGrow Savings is 3.2% APY.",
                evidence_source_doc="Approved Facts",
                evidence_quote="NimbusGrow Savings: 3.2% APY as of Q1 2024.",
                evidence_rule_id="FACT-APY-001",
                suggestion="Replace '2.5% APY' with '3.2% APY'.",
                status="open",
            )
            _add_issue(
                db, review1.id,
                category="claim",
                severity="medium",
                location_start=100,
                location_end=113,
                message="'Best in class' and 'unmatched' are unsubstantiated superlative claims.",
                evidence_source_doc="Brand Guidelines",
                evidence_quote="All comparative or superlative claims must be substantiated with verified data.",
                evidence_rule_id="CLAIM-001",
                suggestion="Remove or qualify: 'competitive rates' instead of 'best in class'.",
                status="open",
            )
            db.commit()

        # Review 2
        review2, created2 = _get_or_create_review(
            db,
            title="NimbusShield Product Page",
            content_text=(
                "NimbusShield Credit Card offers the best credit card experience. "
                "Apply now and enjoy unmatched benefits with 0% intro APR for 15 months."
            ),
            submitted_by=creator.id,
            status="in_review",
        )
        if created2:
            _add_issue(
                db, review2.id,
                category="claim",
                severity="high",
                location_start=35,
                location_end=65,
                message="'Best credit card experience' is an unsubstantiated claim.",
                evidence_source_doc="Brand Guidelines",
                evidence_quote="All comparative or superlative claims must be substantiated with verified data.",
                evidence_rule_id="CLAIM-002",
                suggestion="'NimbusShield Credit Card offers a comprehensive credit experience.'",
                status="open",
            )
            _add_issue(
                db, review2.id,
                category="fact",
                severity="high",
                location_start=110,
                location_end=119,
                message="Incorrect intro APR period: '15 months'. Approved fact states 12 months.",
                evidence_source_doc="Approved Facts",
                evidence_quote="NimbusShield Credit Card: 0% intro APR for 12 months.",
                evidence_rule_id="FACT-APR-001",
                suggestion="Replace '15 months' with '12 months'.",
                status="open",
            )
            db.commit()

        # Review 3
        review3, created3 = _get_or_create_review(
            db,
            title="About Nimbus Bank",
            content_text=(
                "Nimbus Bank was founded in 1990 and is headquartered in Dallas, TX. "
                "We are FDIC insured and committed to your financial growth."
            ),
            submitted_by=creator.id,
            status="in_review",
        )
        if created3:
            _add_issue(
                db, review3.id,
                category="fact",
                severity="high",
                location_start=25,
                location_end=29,
                message="Founded year incorrect: '1990'. Approved fact: founded 1987.",
                evidence_source_doc="Approved Facts",
                evidence_quote="Founded 1987.",
                evidence_rule_id="FACT-FOUND-001",
                suggestion="Replace '1990' with '1987'.",
                status="open",
            )
            _add_issue(
                db, review3.id,
                category="fact",
                severity="medium",
                location_start=60,
                location_end=70,
                message="Headquarters incorrect: 'Dallas, TX'. Approved fact: Austin, TX.",
                evidence_source_doc="Approved Facts",
                evidence_quote="Headquartered in Austin, TX.",
                evidence_rule_id="FACT-HQ-001",
                suggestion="Replace 'Dallas, TX' with 'Austin, TX'.",
                status="open",
            )
            db.commit()

        # ----------------------------------------------------------------
        # 4. Approval for Review 3
        # ----------------------------------------------------------------
        print("\n[Approvals]")
        existing_approval = db.query(Approval).filter(Approval.review_id == review3.id).first()
        if not existing_approval:
            approval = Approval(
                id=str(uuid4()),
                review_id=review3.id,
                approved_by=reviewer.id,
                action="changes_requested",
                comment="Two factual errors found (founded year and headquarters). Please correct and resubmit.",
                created_at=datetime.utcnow(),
            )
            db.add(approval)
            db.commit()
            print("  Created approval for 'About Nimbus Bank'")

        # ----------------------------------------------------------------
        # 5. Audit log entries
        # ----------------------------------------------------------------
        print("\n[Audit Log]")
        existing_audit = db.query(AuditLog).first()
        if not existing_audit:
            entries = [
                AuditLog(
                    id=str(uuid4()),
                    actor_id=admin.id,
                    action="create",
                    resource_type="guideline_doc",
                    resource_id=voice_guide.id,
                    detail="Seeded Voice Guide guideline",
                    created_at=datetime.utcnow(),
                ),
                AuditLog(
                    id=str(uuid4()),
                    actor_id=creator.id,
                    action="submit",
                    resource_type="review",
                    resource_id=review1.id,
                    detail="Submitted Summer Savings Campaign for review",
                    created_at=datetime.utcnow(),
                ),
                AuditLog(
                    id=str(uuid4()),
                    actor_id=reviewer.id,
                    action="changes_requested",
                    resource_type="review",
                    resource_id=review3.id,
                    detail="Requested changes on About Nimbus Bank",
                    created_at=datetime.utcnow(),
                ),
            ]
            for entry in entries:
                db.add(entry)
            db.commit()
            print(f"  Created {len(entries)} audit log entries")

        print("\n[OK] Seed complete.")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
