# SPDX-License-Identifier: AGPL-3.0-or-later

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

import pymupdf as fitz
from docx import Document
from pptx import Presentation
from sqlalchemy import select

from app.db.models import ResourceText, ResourceVersion

TEXT_SUFFIXES = {
    ".txt", ".md", ".markdown", ".py", ".js", ".ts", ".tsx", ".jsx",
    ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs",
    ".sql", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".xml",
    ".html", ".css", ".sh", ".bash", ".zsh", ".csv", ".ipynb",
}


@dataclass(frozen=True)
class ExtractedPage:
    number: int
    text: str
    markdown: str
    no_text_layer: bool = False


def extract(data: bytes, filename: str, mime_type: str) -> list[ExtractedPage]:
    """Return one indexed unit per PDF page or slide; never run macros or OCR."""
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf" or mime_type == "application/pdf":
        with fitz.open(stream=data, filetype="pdf") as pdf:
            result = []
            for index, page in enumerate(pdf, 1):
                value = page.get_text("text", sort=True).strip()
                result.append(ExtractedPage(index, value, f"## Seite {index}\n\n{value}\n", not bool(value)))
            return result
    if suffix == ".pptx":
        presentation = Presentation(BytesIO(data))
        result = []
        for index, slide in enumerate(presentation.slides, 1):
            parts = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    value = shape.text.strip()
                    if value:
                        parts.append(value)
                if shape.has_table:
                    for row in shape.table.rows:
                        parts.append(" | ".join(cell.text.strip() for cell in row.cells))
            value = "\n\n".join(parts)
            result.append(ExtractedPage(index, value, f"## Folie {index}\n\n{value}\n"))
        return result
    if suffix == ".docx":
        doc = Document(BytesIO(data))
        parts = [paragraph.text.strip() for paragraph in doc.paragraphs if paragraph.text.strip()]
        for table in doc.tables:
            parts.extend(" | ".join(cell.text.strip() for cell in row.cells) for row in table.rows)
        value = "\n\n".join(parts)
        return [ExtractedPage(1, value, f"# {Path(filename).stem}\n\n{value}\n")]
    if suffix in TEXT_SUFFIXES or mime_type.startswith("text/"):
        value = data.decode("utf-8-sig", errors="replace")
        fence = "```" if "```" not in value else "````"
        markdown = f"# {Path(filename).name}\n\n{fence}\n{value}\n{fence}\n"
        return [ExtractedPage(1, value, markdown)]
    return []


def index_version(session, version: ResourceVersion, data: bytes, filename: str) -> int:
    if len(data) > 8 * 1024 * 1024:
        # The background indexer discovers committed large versions, also after a restart.
        return 0
    if Path(filename).suffix.lower() == ".pdf" or version.mime_type == "application/pdf":
        with fitz.open(stream=data, filetype="pdf") as pdf:
            if len(pdf) >= 80:
                return 0
    if session.scalar(select(ResourceText.id).where(ResourceText.version_id == version.id).limit(1)):
        return 0
    pages = extract(data, filename, version.mime_type)
    store_pages(session, version, pages)
    return len(pages)


def store_pages(session, version: ResourceVersion, pages: list[ExtractedPage]) -> None:
    """Only database writes: parsing happens beforehand, outside the open transaction."""
    for page in pages:
        session.add(ResourceText(version_id=version.id, page_number=page.number, text=page.text,
                                 markdown=page.markdown, no_text_layer=page.no_text_layer))


def document_markdown(session, version_id: int) -> str:
    pages = session.scalars(select(ResourceText).where(ResourceText.version_id == version_id)
                            .order_by(ResourceText.page_number)).all()
    return "\n\n".join(page.markdown or page.text for page in pages)
