# SPDX-License-Identifier: AGPL-3.0-or-later

"""On-demand OCR for scanned PDF pages; normal sync stays fast."""

from pathlib import Path

import pymupdf
from filelock import FileLock, Timeout
from pydantic import BaseModel

from app.config import Settings
from app.extract.ocr_repository import OCRRepository
from app.material.errors import MaterialError
from app.material.preview import source_path

MAX_PDF_BYTES = 100 * 1024 * 1024
BATCH_PAGES = 5


class OCRStatus(BaseModel):
    pending_pages: int
    recognized_pages: int
    empty_pages: int
    available: bool
    language: str | None


class OCRError(ValueError):
    pass


def local_tessdata() -> tuple[Path, str] | None:
    try:
        folder = Path(pymupdf.get_tessdata())
    except RuntimeError:
        return None
    languages = [name for name in ("deu", "eng") if (folder / f"{name}.traineddata").is_file()]
    return (folder, "+".join(languages)) if languages else None


class OCRService:
    def __init__(self, repository: OCRRepository, settings: Settings):
        self.repository = repository
        self.settings = settings

    def status(self, version_id: int) -> OCRStatus:
        version, pages = self.repository.page_state(version_id)
        if version is None:
            raise LookupError("Materialversion nicht gefunden")
        language = local_tessdata()
        return OCRStatus(
            pending_pages=sum(page.no_text_layer and page.ocr_attempted_at is None for page in pages),
            recognized_pages=sum(page.no_text_layer and page.ocr_attempted_at is not None
                                 and bool(page.text.strip()) for page in pages),
            empty_pages=sum(page.no_text_layer and page.ocr_attempted_at is not None
                            and not page.text.strip() for page in pages),
            available=language is not None,
            language=language[1] if language else None,
        )

    def process(self, version_id: int, *, before_page=None) -> OCRStatus:
        version, pages = self.repository.page_state(version_id)
        if version is None:
            raise LookupError("Materialversion nicht gefunden")
        if version.mime_type != "application/pdf":
            raise OCRError("Texterkennung ist nur für PDF-Dateien verfügbar")
        pending = [page for page in pages if page.no_text_layer and page.ocr_attempted_at is None]
        if not pending:
            return self.status(version_id)
        language = local_tessdata()
        if language is None:
            raise OCRError("Lokale Texterkennung fehlt. Tesseract mit deutschem oder englischem Sprachpaket installieren.")
        try:
            source = source_path(self.settings.data_dir, version)
            if source.stat().st_size > MAX_PDF_BYTES:
                raise OCRError("PDF ist für die lokale Texterkennung zu groß")
        except (MaterialError, OSError) as exc:
            raise OCRError("PDF-Datei ist nicht verfügbar") from exc
        lock_dir = self.settings.local_dir / "ocr-locks"
        lock_dir.mkdir(parents=True, exist_ok=True)
        try:
            with FileLock(lock_dir / f"{version_id}.lock", timeout=2), pymupdf.open(source) as pdf:
                for item in pending[:BATCH_PAGES]:
                    if before_page is not None:
                        before_page()
                    if item.page_number < 1 or item.page_number > len(pdf):
                        raise OCRError("Der Seitenindex passt nicht zur PDF-Datei")
                    page = pdf[item.page_number - 1]
                    try:
                        textpage = page.get_textpage_ocr(language=language[1], dpi=150,
                                                         full=True, tessdata=str(language[0]))
                        value = page.get_text("text", textpage=textpage, sort=True).strip()
                    except RuntimeError as exc:
                        raise OCRError("Lokale Texterkennung fehlgeschlagen; Sprachpaket und PDF prüfen") from exc
                    self.repository.save_page(item.id, value, before_commit=before_page)
        except Timeout as exc:
            raise OCRError("Texterkennung läuft bereits") from exc
        except (RuntimeError, OSError) as exc:
            raise OCRError("PDF konnte für die Texterkennung nicht gelesen werden") from exc
        return self.status(version_id)
