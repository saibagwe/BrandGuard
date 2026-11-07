"""Guidelines router."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.db import GuidelineDoc, GuidelineChunk, User
from app.models.schemas import GuidelineDocOut

router = APIRouter(prefix="/guidelines", tags=["guidelines"])


def _doc_to_out(doc: GuidelineDoc, db: Session) -> GuidelineDocOut:
    chunks_count = db.query(GuidelineChunk).filter(GuidelineChunk.doc_id == doc.id).count()
    return GuidelineDocOut(
        id=doc.id,
        title=doc.title,
        doc_type=doc.doc_type,
        content_text=doc.content_text,
        created_by=doc.created_by,
        created_at=doc.created_at,
        chunks_count=chunks_count,
    )


@router.get("", response_model=list[GuidelineDocOut])
def list_guidelines(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    docs = db.query(GuidelineDoc).all()
    return [_doc_to_out(doc, db) for doc in docs]


@router.get("/{doc_id}", response_model=GuidelineDocOut)
def get_guideline(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.query(GuidelineDoc).filter(GuidelineDoc.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Guideline doc not found")
    return _doc_to_out(doc, db)
