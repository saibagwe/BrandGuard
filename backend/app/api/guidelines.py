"""Guidelines router."""
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.db import GuidelineDoc, GuidelineChunk, User
from app.models.schemas import GuidelineDocCreate, GuidelineDocUpdate, GuidelineDocOut
from app.services import embedding_service, audit_service

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


@router.post("", response_model=GuidelineDocOut, status_code=status.HTTP_201_CREATED)
def create_guideline(
    payload: GuidelineDocCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    norm_type = payload.normalized_doc_type()
    if norm_type not in ("voice", "terminology", "facts", "visual"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid doc_type '{payload.doc_type}'. Must be voice, terminology, facts, or visual.",
        )

    doc = GuidelineDoc(
        id=str(uuid4()),
        title=payload.title,
        doc_type=norm_type,
        content_text=payload.content_text,
        created_by=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Embed and store chunks
    embedding_service.embed_and_store(doc, db)

    audit_service.log(
        db,
        current_user.id,
        "create",
        "guideline_doc",
        doc.id,
        detail=f"Created guideline '{doc.title}' ({doc.doc_type})",
    )
    return _doc_to_out(doc, db)


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


@router.put("/{doc_id}", response_model=GuidelineDocOut)
@router.patch("/{doc_id}", response_model=GuidelineDocOut)
def update_guideline(
    doc_id: str,
    payload: GuidelineDocUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    doc = db.query(GuidelineDoc).filter(GuidelineDoc.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Guideline doc not found")

    if payload.title is not None:
        doc.title = payload.title.strip()

    if payload.doc_type is not None:
        norm_type = payload.normalized_doc_type()
        if norm_type not in ("voice", "terminology", "facts", "visual"):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid doc_type '{payload.doc_type}'. Must be voice, terminology, facts, or visual.",
            )
        doc.doc_type = norm_type

    if payload.content_text is not None:
        doc.content_text = payload.content_text

    db.commit()
    db.refresh(doc)

    # Re-chunk and re-embed
    embedding_service.embed_and_store(doc, db)

    audit_service.log(
        db,
        current_user.id,
        "update",
        "guideline_doc",
        doc.id,
        detail=f"Updated guideline '{doc.title}' ({doc.doc_type})",
    )
    return _doc_to_out(doc, db)


@router.delete("/{doc_id}")
def delete_guideline(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    doc = db.query(GuidelineDoc).filter(GuidelineDoc.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Guideline doc not found")

    title = doc.title
    doc_type = doc.doc_type

    # Remove chunks first
    db.query(GuidelineChunk).filter(GuidelineChunk.doc_id == doc.id).delete()
    db.delete(doc)
    db.commit()

    audit_service.log(
        db,
        current_user.id,
        "delete",
        "guideline_doc",
        doc_id,
        detail=f"Deleted guideline '{title}' ({doc_type})",
    )
    return {"status": "deleted", "id": doc_id}
