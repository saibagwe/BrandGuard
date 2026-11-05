"""Embedding service — chunking, embedding storage, and similarity search."""
from __future__ import annotations

import json
import math
from uuid import uuid4
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.db import GuidelineDoc, GuidelineChunk
from app.llm.provider import llm


def chunk_text(text: str, chunk_size: int = 500) -> list[str]:
    """Split *text* into overlapping chunks of approximately *chunk_size* characters."""
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    overlap = chunk_size // 5  # 20% overlap

    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        if end >= len(text):
            break
        start = end - overlap

    return chunks


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def embed_and_store(doc: GuidelineDoc, db: Session) -> None:
    """Chunk *doc*, embed each chunk, and persist GuidelineChunk rows."""
    # Remove old chunks for this doc
    db.query(GuidelineChunk).filter(GuidelineChunk.doc_id == doc.id).delete()
    db.commit()

    chunks = chunk_text(doc.content_text)
    embeddings = llm.embed(chunks)

    for idx, (chunk_text_val, embedding) in enumerate(zip(chunks, embeddings)):
        chunk = GuidelineChunk(
            id=str(uuid4()),
            doc_id=doc.id,
            chunk_text=chunk_text_val,
            chunk_index=idx,
            embedding_json=json.dumps(embedding),
            created_at=datetime.utcnow(),
        )
        db.add(chunk)

    db.commit()


def find_similar_chunks(
    query: str,
    db: Session,
    top_k: int = 5,
) -> list[GuidelineChunk]:
    """Return the *top_k* most similar chunks to *query* by cosine similarity.

    Falls back to returning all chunks if no embeddings exist.
    """
    all_chunks: list[GuidelineChunk] = db.query(GuidelineChunk).all()
    if not all_chunks:
        return []

    # Check if embeddings are non-trivial (not all zeros)
    has_real_embeddings = False
    for chunk in all_chunks:
        if chunk.embedding_json:
            emb = json.loads(chunk.embedding_json)
            if any(v != 0.0 for v in emb):
                has_real_embeddings = True
                break

    if not has_real_embeddings:
        # Return all chunks (up to top_k) since embeddings are stubs
        return all_chunks[:top_k] if len(all_chunks) > top_k else all_chunks

    query_embedding = llm.embed([query])[0]

    scored: list[tuple[float, GuidelineChunk]] = []
    for chunk in all_chunks:
        if not chunk.embedding_json:
            continue
        chunk_emb = json.loads(chunk.embedding_json)
        score = _cosine_similarity(query_embedding, chunk_emb)
        scored.append((score, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in scored[:top_k]]
