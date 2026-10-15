# SPDX-License-Identifier: AGPL-3.0-or-later

"""Persist local OCR text in the existing searchable page index."""

from sqlalchemy import select

from app.db.models import ResourceText, ResourceVersion, utc_now


class OCRRepository:
    def __init__(self, factory):
        self.factory = factory

    def page_state(self, version_id: int) -> tuple[ResourceVersion | None, list[ResourceText]]:
        with self.factory() as session:
            version = session.get(ResourceVersion, version_id)
            pages = list(session.scalars(select(ResourceText).where(ResourceText.version_id == version_id)
                                         .order_by(ResourceText.page_number)).all())
            return version, pages

    def save_page(self, page_id: int, value: str, *, before_commit=None) -> None:
        with self.factory() as session:
            page = session.get(ResourceText, page_id)
            if page is None or page.ocr_attempted_at is not None:
                return
            page.text = value
            page.markdown = f"## Seite {page.page_number}\n\n{value}\n"
            page.ocr_attempted_at = utc_now()
            if before_commit is not None:
                before_commit()
            session.commit()
