"""Script to generate sample PDF and DOCX files for testing file upload."""
import io
import os

def create_sample_pdf():
    """Create a minimal PDF with selectable text using PyMuPDF."""
    try:
        import fitz
    except ImportError:
        print("PyMuPDF not installed, skipping PDF creation")
        return

    sample_text = (
        "BrandGuard Summer Campaign — SAMPLE DOCUMENT\n\n"
        "Discover our summer savings offer. Enjoy 3.2% APY on your Acme Savings "
        "account — a rate designed to help you grow your money.\n\n"
        "Acme Savings: 3.2% APY as of Q1 2024.\n"
        "BrandGuard is FDIC insured, headquartered in Austin, TX, and was founded in 1987.\n\n"
        "Terms and conditions apply. Contact your branch for details.\n"
    )

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 72),
        sample_text,
        fontsize=12,
        fontname="helv",
    )
    out_path = os.path.join(os.path.dirname(__file__), "sample.pdf")
    doc.save(out_path)
    doc.close()
    print(f"Created {out_path}")


def create_sample_docx():
    """Create a minimal DOCX with sample content using python-docx."""
    try:
        from docx import Document
    except ImportError:
        print("python-docx not installed, skipping DOCX creation")
        return

    doc = Document()
    doc.add_heading("BrandGuard Summer Campaign — SAMPLE DOCUMENT", 0)
    doc.add_paragraph(
        "Discover our summer savings offer. Enjoy 3.2% APY on your Acme Savings "
        "account — a rate designed to help you grow your money."
    )
    doc.add_paragraph(
        "Acme Savings: 3.2% APY as of Q1 2024. "
        "BrandGuard is FDIC insured, headquartered in Austin, TX, and was founded in 1987."
    )
    doc.add_paragraph("Terms and conditions apply. Contact your branch for details.")

    out_path = os.path.join(os.path.dirname(__file__), "sample.docx")
    doc.save(out_path)
    print(f"Created {out_path}")


if __name__ == "__main__":
    create_sample_pdf()
    create_sample_docx()
