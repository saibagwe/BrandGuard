"""Tests for file extraction service (PDF, DOCX, plain text)."""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from app.services.file_extraction import extract, ExtractionError, MAX_FILE_SIZE

# Seed file paths
SEED_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seed")
SAMPLE_PDF = os.path.join(SEED_DIR, "sample.pdf")
SAMPLE_DOCX = os.path.join(SEED_DIR, "sample.docx")


class TestPdfExtraction:
    def test_extracts_text_from_sample_pdf(self):
        with open(SAMPLE_PDF, "rb") as f:
            data = f.read()
        text, ctype = extract("sample.pdf", data)
        assert ctype == "pdf"
        assert len(text) > 20
        assert "Nimbus" in text or "NimbusGrow" in text or "3.2" in text

    def test_raises_on_empty_pdf(self):
        # Create a minimal valid-but-empty PDF
        import fitz
        doc = fitz.open()
        doc.new_page()
        import io
        buf = io.BytesIO()
        doc.save(buf)
        doc.close()
        with pytest.raises(ExtractionError, match="No text"):
            extract("empty.pdf", buf.getvalue())

    def test_raises_on_zero_bytes(self):
        with pytest.raises(ExtractionError, match="empty"):
            extract("file.pdf", b"")

    def test_raises_on_oversized_file(self):
        big = b"x" * (MAX_FILE_SIZE + 1)
        with pytest.raises(ExtractionError, match="too large"):
            extract("big.pdf", big)


class TestDocxExtraction:
    def test_extracts_text_from_sample_docx(self):
        with open(SAMPLE_DOCX, "rb") as f:
            data = f.read()
        text, ctype = extract("sample.docx", data)
        assert ctype == "docx"
        assert len(text) > 20
        assert "Nimbus" in text or "NimbusGrow" in text or "3.2" in text

    def test_raises_on_invalid_docx(self):
        with pytest.raises(ExtractionError):
            extract("bad.docx", b"not a docx file at all 12345")

    def test_raises_on_empty_bytes(self):
        with pytest.raises(ExtractionError, match="empty"):
            extract("file.docx", b"")


class TestTextExtraction:
    def test_extracts_plain_text(self):
        content = "Hello, this is a plain text file with Nimbus Bank content."
        text, ctype = extract("content.txt", content.encode("utf-8"))
        assert ctype == "text"
        assert "Nimbus Bank" in text

    def test_raises_on_empty_text_file(self):
        with pytest.raises(ExtractionError, match="empty"):
            extract("file.txt", b"")

    def test_accepts_whitespace_only_as_empty(self):
        with pytest.raises(ExtractionError):
            extract("file.txt", b"   \n\t  ")


class TestUnsupportedType:
    def test_raises_on_pptx(self):
        with pytest.raises(ExtractionError, match="Unsupported"):
            extract("deck.pptx", b"some data")

    def test_raises_on_xlsx(self):
        with pytest.raises(ExtractionError, match="Unsupported"):
            extract("spreadsheet.xlsx", b"some data")

    def test_raises_on_png(self):
        with pytest.raises(ExtractionError, match="Unsupported"):
            extract("image.png", b"\x89PNG\r\n\x1a\n")
