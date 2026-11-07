"""File extraction service — extracts text from PDF, DOCX, and TXT files."""
from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


class ExtractionError(ValueError):
    """Raised when file cannot be extracted or is invalid."""


def extract_pdf(data: bytes) -> str:
    """Extract text from a PDF file using PyMuPDF. Raises ExtractionError on failure."""
    try:
        import pymupdf as fitz
    except ImportError:
        try:
            import fitz
        except ImportError as exc:
            raise ExtractionError("PyMuPDF is not installed on the system.") from exc

    try:
        doc = fitz.open(stream=io.BytesIO(data), filetype="pdf")
    except Exception as exc:
        raise ExtractionError(f"Could not open PDF file: {exc}") from exc

    pages_text: list[str] = []
    for page in doc:
        pages_text.append(page.get_text())
    doc.close()

    text = "\n".join(pages_text).strip()
    if not text:
        raise ExtractionError(
            "No text could be extracted from this PDF. "
            "It may be a scanned image-only PDF. Scanned PDFs without OCR are not supported."
        )
    return text


def extract_docx(data: bytes) -> str:
    """Extract text from a DOCX file using python-docx. Raises ExtractionError on failure."""
    try:
        from docx import Document
    except ImportError as exc:
        raise ExtractionError("python-docx is not installed on the system.") from exc

    try:
        doc = Document(io.BytesIO(data))
    except Exception as exc:
        raise ExtractionError(f"Could not open DOCX file: {exc}") from exc

    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    # Also extract any text from tables
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
            if row_text:
                paragraphs.append(row_text)

    text = "\n".join(paragraphs).strip()
    if not text:
        raise ExtractionError("DOCX file appears to be empty or has no readable text.")
    return text


def extract_text_file(data: bytes) -> str:
    """Decode a plain text file."""
    for encoding in ("utf-8", "latin-1", "utf-16"):
        try:
            text = data.decode(encoding).strip()
            if text:
                return text
        except (UnicodeDecodeError, ValueError):
            continue
    raise ExtractionError("Text file is empty or contains no readable text.")


def extract(filename: str, data: bytes) -> tuple[str, str]:
    """
    Extract text and determine source type from uploaded file bytes.
    Returns (extracted_text, source_type) where source_type is 'pdf', 'docx', or 'text'.
    Raises ExtractionError on unsupported formats, oversized files, or empty files.
    """
    if len(data) == 0:
        raise ExtractionError("Uploaded file is empty.")
    if len(data) > MAX_FILE_SIZE:
        raise ExtractionError(
            f"File is too large ({len(data) / (1024 * 1024):.1f} MB). Maximum size is 10 MB."
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
            f"Unsupported file type. Only PDF (.pdf), Word (.docx), and Text (.txt) files are supported."
        )
