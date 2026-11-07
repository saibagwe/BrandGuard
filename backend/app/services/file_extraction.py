"""File extraction service — backward-compatible facade delegating to extraction_service."""
from __future__ import annotations

from app.services.extraction_service import (
    MAX_FILE_SIZE,
    ExtractionError,
    extract_pdf,
    extract_docx,
    extract_text_file,
    extract,
)

__all__ = [
    "MAX_FILE_SIZE",
    "ExtractionError",
    "extract_pdf",
    "extract_docx",
    "extract_text_file",
    "extract",
]
