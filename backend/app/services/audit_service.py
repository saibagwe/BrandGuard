"""Audit log service."""
from __future__ import annotations

from typing import Optional
from uuid import uuid4
from datetime import datetime

from sqlalchemy.orm import Session
from app.models.db import AuditLog


def log(
    db: Session,
    actor_id: Optional[str],
    action: str,
    resource_type: str,
    resource_id: str,
    detail: Optional[str] = None,
) -> AuditLog:
    """Create an audit log entry."""
    entry = AuditLog(
        id=str(uuid4()),
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
