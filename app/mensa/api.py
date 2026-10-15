# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read-only university services: official mailbox address and menus."""

from datetime import date, datetime, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Query, Response

from app.config import Settings
from app.institutions import load_institution
from app.mensa.image_cache import MealImageCache
from app.mensa.repository import MenuRepository
from app.mensa.service import Menu, MenuService, read_image


def mensa_router(settings: Settings) -> APIRouter:

    router = APIRouter(prefix="/api/mensa", tags=["mensa"])

    service = MenuService(MenuRepository(settings.local_dir))
    image_cache = MealImageCache(read_image)

    @router.get("/image", response_class=Response)
    def image(path: str = Query(max_length=250)):
        try:
            raw, media_type = image_cache.get(path)
            return Response(raw, media_type=media_type, headers={"Cache-Control": "private, max-age=86400"})
        except (ValueError, httpx.HTTPError):
            raise HTTPException(404, "Mensa-Foto nicht verfügbar") from None

    @router.get("/services")
    def services():

        profile = load_institution(settings.institution_slug)

        return {
            "canteens": [
                item.model_dump() for item in profile.canteens if item.provider == "swo"
            ],
            "mail_url": str(profile.mail.web_url) if profile.mail.web_url else None,
            "timezone": str(settings.timezone),
        }

    @router.get("/plan", response_model=Menu)
    def plan(canteen: str = Query(max_length=80), day: date | None = None):

        profile = load_institution(settings.institution_slug)

        if canteen not in {
            item.slug for item in profile.canteens if item.provider == "swo"
        }:
            raise HTTPException(
                422, "Mensa ist für diese Hochschule nicht eingerichtet."
            )

        today = datetime.now(settings.timezone).date()

        day = day or today

        if not today - timedelta(days=7) <= day <= today + timedelta(days=60):
            raise HTTPException(422, "Datum liegt außerhalb des Speiseplan-Zeitraums.")

        try:
            return service.get(canteen, day)

        except ValueError as exc:
            raise HTTPException(503, str(exc)) from None

    return router
