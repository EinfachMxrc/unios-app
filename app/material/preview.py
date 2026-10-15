# SPDX-License-Identifier: AGPL-3.0-or-later

"""Create immutable PDF viewing copies of office and plain text documents."""

import os
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

import pymupdf
from filelock import FileLock

from app.db.models import ResourceVersion
from app.files.atomic import ensure_directory, write_once
from app.files.localpath import resolve_local
from app.material.errors import MaterialError
from app.material.text_pdf import text_pdf

MAX_PREVIEW_BYTES = 100 * 1024 * 1024


class PreviewUnavailable(MaterialError):
    pass


def source_path(data_dir: Path, version: ResourceVersion) -> Path:
    path = resolve_local(data_dir / version.relative_path)
    if not path.is_relative_to(resolve_local(data_dir / "uni")) or not path.is_file():
        raise MaterialError("Materialdatei nicht verfügbar")
    return path


def preview_pdf_path(data_dir: Path, version: ResourceVersion, *, allow_convert: bool = False) -> Path:
    source = source_path(data_dir, version)
    if version.mime_type == "application/pdf" or source.suffix.lower() == ".pdf":
        return source
    suffix = source.suffix.lower()
    filters = {".pptx": "impress_pdf_Export", ".ppt": "impress_pdf_Export",
               ".docx": "writer_pdf_Export", ".doc": "writer_pdf_Export"}
    if suffix not in filters and suffix != ".txt":
        raise MaterialError("Viewer unterstützt PDF, TXT, PowerPoint und Word")
    if not version.sha256 or len(version.sha256) != 64 or any(character not in "0123456789abcdef" for character in version.sha256):
        raise MaterialError("Ungültige Materialversion")
    folder = data_dir / "derived" / "document-pdf" / version.sha256
    target = folder / "preview.pdf"
    if folder.is_symlink() or not resolve_local(folder).is_relative_to(resolve_local(data_dir / "derived")):
        raise MaterialError("Ungültige Vorschauablage")
    if target.is_file() and not target.is_symlink():
        return target
    if not allow_convert:
        raise PreviewUnavailable("Dokumentansicht ist noch nicht vorbereitet. Öffne sie zuerst auf dem Hauptgerät.")
    folder = ensure_directory(data_dir / "derived", "document-pdf", version.sha256)
    if suffix == ".txt":
        with FileLock(folder / "convert.lock", timeout=45):
            if target.is_symlink():
                raise MaterialError("Ungültige Vorschauablage")
            if not target.is_file():
                write_once(target, text_pdf(source))
        return target
    executable = os.environ.get("LIBREOFFICE_BIN") or shutil.which("soffice")
    if not executable or not Path(executable).is_file():
        raise PreviewUnavailable("LibreOffice ist für die Dokumentansicht nicht eingerichtet. Das Original bleibt als Download verfügbar.")
    with FileLock(folder / "convert.lock", timeout=45):
        if target.is_file() and not target.is_symlink():
            return target
        with TemporaryDirectory(prefix="uni-os-document-") as temporary:
            work = Path(temporary)
            profile = (work / "profile").as_uri()
            try:
                outcome = subprocess.run(
                    [executable, f"-env:UserInstallation={profile}", "--headless", "--convert-to",
                     f"pdf:{filters[suffix]}", "--outdir", str(work), str(source)],
                    cwd=work, capture_output=True, timeout=45, check=False,
                    env={**os.environ, "SAL_USE_VCLPLUGIN": "svp"},
                )
            except (OSError, subprocess.TimeoutExpired) as exc:
                raise PreviewUnavailable("Dokumentumwandlung fehlgeschlagen. Das Original bleibt als Download verfügbar.") from exc
            converted = work / f"{source.stem}.pdf"
            if outcome.returncode != 0 or not converted.is_file() or converted.stat().st_size > MAX_PREVIEW_BYTES:
                raise PreviewUnavailable("Dokumentumwandlung fehlgeschlagen. Das Original bleibt als Download verfügbar.")
            content = converted.read_bytes()
            try:
                with pymupdf.open(stream=content, filetype="pdf") as pdf:
                    if not len(pdf):
                        raise ValueError("PDF ohne Seiten")
            except Exception as exc:
                raise PreviewUnavailable("Dokumentumwandlung erzeugte keine gültige PDF.") from exc
            write_once(target, content)
    return target
