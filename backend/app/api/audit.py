"""Audit log router — Reviewer only audit trail view."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_role
from app.models.db import AuditLog, User
from app.models.schemas import AuditLogOut

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogOut])
def get_audit_logs(
    user: Optional[str] = None,
    action: Optional[str] = None,
    review_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("reviewer")),
):
    """Retrieve audit log entries newest first with optional filters."""
    query = db.query(AuditLog)

    if user:
        clean_user = user.strip()
        matched_user_ids = [
            u.id for u in db.query(User).filter(
                or_(User.email.ilike(f"%{clean_user}%"), User.full_name.ilike(f"%{clean_user}%"), User.id == clean_user)
            ).all()
        ]
        if matched_user_ids:
            query = query.filter(or_(AuditLog.actor_id.in_(matched_user_ids), AuditLog.actor_id == clean_user))
        else:
            query = query.filter(AuditLog.actor_id == clean_user)

    if action:
        query = query.filter(AuditLog.action == action.strip())

    if review_id:
        clean_rev = review_id.strip()
        query = query.filter(
            or_(
                AuditLog.resource_id == clean_rev,
                AuditLog.detail.ilike(f"%{clean_rev}%"),
            )
        )

    entries = (
        query
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(min(limit, 200))
        .all()
    )

    actor_ids = {e.actor_id for e in entries if e.actor_id}
    users = db.query(User).filter(User.id.in_(actor_ids)).all() if actor_ids else []
    user_map = {u.id: u for u in users}

    out: list[AuditLogOut] = []
    for entry in entries:
        u = user_map.get(entry.actor_id) if entry.actor_id else None
        out.append(
            AuditLogOut(
                id=entry.id,
                actor_id=entry.actor_id,
                actor_name=u.full_name if u else None,
                actor_email=u.email if u else None,
                action=entry.action,
                resource_type=entry.resource_type,
                resource_id=entry.resource_id,
                detail=entry.detail,
                created_at=entry.created_at,
            )
        )

    return out
