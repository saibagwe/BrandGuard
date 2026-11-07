"""Guidelines router — CRUD, file upload, and embedding integration."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.db import GuidelineDoc, GuidelineChunk, User
from app.models.schemas import GuidelineDocCreate, GuidelineDocUpdate, GuidelineDocOut
from app.services import embedding_service, audit_service
from app.services.extraction_service import extract, ExtractionError

router = APIRouter(prefix="/guidelines", tags=["guidelines"])

VALID_DOC_TYPES = {"voice", "terminology", "facts", "visual"}


def _normalize_doc_type(val: str) -> str:
    mapping = {
        "brand-voice": "voice",
        "brand_voice": "voice",
        "voice": "voice",
        "terminology": "terminology",
        "approved-facts": "facts",
        "approved_facts": "facts",
        "facts": "facts",
        "visual": "visual",
    }
    cleaned = (val or "").strip().lower()
    norm = mapping.get(cleaned, cleaned)
    if norm not in VALID_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid doc_type '{val}'. Must be one of: voice, terminology, facts.",
        )
    return norm


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


# ---------------------------------------------------------------------------
# Read Endpoints (Available to both Creator and Reviewer)
# ---------------------------------------------------------------------------

@router.get("", response_model=list[GuidelineDocOut])
def list_guidelines(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    docs = db.query(GuidelineDoc).order_by(GuidelineDoc.created_at.desc()).all()
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


# ---------------------------------------------------------------------------
# Write Endpoints (Reviewer only, Creator gets 403)
# ---------------------------------------------------------------------------

@router.post("", response_model=GuidelineDocOut, status_code=status.HTTP_201_CREATED)
def create_guideline(
    payload: GuidelineDocCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("reviewer")),
):
    norm_type = _normalize_doc_type(payload.doc_type)
    text = (payload.content_text or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Guideline content cannot be empty.")

    doc = GuidelineDoc(
        id=str(uuid4()),
        title=payload.title.strip(),
        doc_type=norm_type,
        content_text=text,
        created_by=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Re-chunk and re-embed
    embedding_service.embed_and_store(doc, db)

    audit_service.log(
        db,
        actor_id=current_user.id,
        action="guideline_created",
        resource_type="guideline_doc",
        resource_id=doc.id,
        detail=f"Created guideline '{doc.title}' ({doc.doc_type})",
    )

    return _doc_to_out(doc, db)


@router.post("/upload", response_model=GuidelineDocOut, status_code=status.HTTP_201_CREATED)
async def upload_guideline(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    title: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("reviewer")),
):
    norm_type = _normalize_doc_type(doc_type)
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        extracted_text, _ = extract(file.filename or "upload.txt", file_bytes)
    except ExtractionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    effective_title = (title or "").strip() or file.filename or "Uploaded Guideline"

    doc = GuidelineDoc(
        id=str(uuid4()),
        title=effective_title,
        doc_type=norm_type,
        content_text=extracted_text,
        created_by=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    embedding_service.embed_and_store(doc, db)

    audit_service.log(
        db,
        actor_id=current_user.id,
        action="guideline_created",
        resource_type="guideline_doc",
        resource_id=doc.id,
        detail=f"Uploaded guideline '{doc.title}' ({doc.doc_type}) from {file.filename}",
    )

    return _doc_to_out(doc, db)


@router.put("/{doc_id}", response_model=GuidelineDocOut)
@router.patch("/{doc_id}", response_model=GuidelineDocOut)
def update_guideline(
    doc_id: str,
    payload: GuidelineDocUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("reviewer")),
):
    doc = db.query(GuidelineDoc).filter(GuidelineDoc.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Guideline doc not found")

    if payload.title is not None and payload.title.strip():
        doc.title = payload.title.strip()
    if payload.doc_type is not None:
        doc.doc_type = _normalize_doc_type(payload.doc_type)
    if payload.content_text is not None:
        text = payload.content_text.strip()
        if not text:
            raise HTTPException(status_code=422, detail="Guideline content cannot be empty.")
        doc.content_text = text

    db.commit()
    db.refresh(doc)

    # Re-chunk and re-embed
    embedding_service.embed_and_store(doc, db)

    audit_service.log(
        db,
        actor_id=current_user.id,
        action="guideline_updated",
        resource_type="guideline_doc",
        resource_id=doc.id,
        detail=f"Updated guideline '{doc.title}'",
    )

    return _doc_to_out(doc, db)


@router.delete("/{doc_id}", status_code=status.HTTP_200_OK)
def delete_guideline(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("reviewer")),
):
    doc = db.query(GuidelineDoc).filter(GuidelineDoc.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Guideline doc not found")

    title = doc.title
    # Delete chunks first
    db.query(GuidelineChunk).filter(GuidelineChunk.doc_id == doc_id).delete()
    db.delete(doc)
    db.commit()

    audit_service.log(
        db,
        actor_id=current_user.id,
        action="guideline_deleted",
        resource_type="guideline_doc",
        resource_id=doc_id,
        detail=f"Deleted guideline '{title}'",
    )

    return {"status": "deleted", "id": doc_id, "title": title}
