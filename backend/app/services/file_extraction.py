"""File extraction service — PDF and DOCX to plain text."""
from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


class ExtractionError(ValueError):
    """Raised when file cannot be extracted."""


def extract_pdf(data: bytes) -> str:
    """Extract text from a PDF file. Raises ExtractionError on failure."""
    try:
        import fitz  # PyMuPDF
    except ImportError as exc:
        raise ExtractionError("PyMuPDF not installed") from exc

    try:
        doc = fitz.open(stream=io.BytesIO(data), filetype="pdf")
    except Exception as exc:
        raise ExtractionError(f"Could not open PDF: {exc}") from exc

    pages_text: list[str] = []
    for page in doc:
        pages_text.append(page.get_text())
    doc.close()

    text = "\n".join(pages_text).strip()
    if not text:
        raise ExtractionError(
            "No text could be extracted from this PDF. "
            "It may be a scanned image-only PDF. Please paste the text directly."
        )
    return text


def extract_docx(data: bytes) -> str:
    """Extract text from a DOCX file. Raises ExtractionError on failure."""
    try:
        from docx import Document
    except ImportError as exc:
        raise ExtractionError("python-docx not installed") from exc

    try:
        doc = Document(io.BytesIO(data))
    except Exception as exc:
        raise ExtractionError(f"Could not open DOCX: {exc}") from exc

    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    text = "\n".join(paragraphs).strip()
    if not text:
        raise ExtractionError("DOCX file appears to be empty or has no readable text.")
    return text


def extract_text_file(data: bytes) -> str:
    """Decode a plain-text file."""
    for encoding in ("utf-8", "latin-1", "utf-16"):
        try:
            text = data.decode(encoding).strip()
            if text:
                return text
        except (UnicodeDecodeError, ValueError):
            continue
    # Fallback: if decode succeeded but was whitespace only
    raise ExtractionError("Text file is empty or contains only whitespace. Please paste the text directly.")


def extract(filename: str, data: bytes) -> tuple[str, str]:
    """
    Extract text from uploaded file bytes.
    Returns (extracted_text, content_type) where content_type is 'pdf'|'docx'|'text'.
    Raises ExtractionError on any problem.
    """
    if len(data) == 0:
        raise ExtractionError("Uploaded file is empty.")
    if len(data) > MAX_FILE_SIZE:
        raise ExtractionError(
            f"File is too large ({len(data) // (1024*1024)} MB). Maximum size is 10 MB."
        )

    lower = (filename or "").lower()
    if lower.endswith(".pdf"):
        return extract_pdf(data), "pdf"
    elif lower.endswith(".docx"):
        return extract_docx(data), "docx"
    elif lower.endswith((".txt", ".md", ".text")):
        return extract_text_file(data), "text"
    else:
        raise ExtractionError(
            f"Unsupported file type '{filename}'. "
            "Supported formats: PDF (.pdf), Word (.docx), plain text (.txt)."
        )
