# SPDX-License-Identifier: AGPL-3.0-or-later

"""Official SWO menu reader, with bounded requests and an offline cache."""

import json
import re
from datetime import UTC, date, datetime, timedelta
from threading import Lock
from typing import Literal
from urllib.parse import quote

import httpx
from pydantic import BaseModel, Field, ValidationError

from app.mensa.repository import MenuRepository

BASE = "https://sls.swo.bayern"

CATEGORIES = [
    "main",
    "vegan",
    "side",
    "dessert",
    "salad",
    "pasta_counter",
    "food_truck",
    "night",
]


class Meal(BaseModel):
    name: str = Field(max_length=1000)

    student_price: float | None = Field(default=None, ge=0, le=1000)

    allergens: str = Field(default="", max_length=500)

    dietary: Literal["vegan", "vegetarian", "fish", "meat", "unknown"] = "unknown"

    category: str = Field(default="other", pattern="^(main|vegan|side|dessert|salad|pasta_counter|food_truck|night|other)$")

    image_url: str | None = None


def image_path(value: object) -> str | None:
    if isinstance(value, str) and re.fullmatch(r"/(?:_ipx/f_webp,s_(?:400x225|800x450|1200x675|1600x900)/)?meals/[0-9]+\.(?:jpg|png|webp)(?:\?m=[0-9]+)?", value):
        return value
    return None


def read_image(path: str) -> tuple[bytes, str]:
    if image_path(path) is None:
        raise ValueError("Ungültiges Mensa-Foto")
    with httpx.Client(timeout=12, follow_redirects=False) as client, client.stream("GET", BASE + path) as response:
        response.raise_for_status()
        media_type = response.headers.get("content-type", "").split(";")[0]
        if media_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise ValueError("Mensa-Foto nicht verfügbar")
        raw = bytearray()
        for chunk in response.iter_bytes():
            raw.extend(chunk)
            if len(raw) > 4_000_000:
                raise ValueError("Mensa-Foto ist zu groß")
        return bytes(raw), media_type


def dietary_label(
    symbols: object,
) -> Literal["vegan", "vegetarian", "fish", "meat", "unknown"]:
    """Use SWO's explicit food symbol IDs, never dish names or missing allergens.

    Source: the public legend at https://sls.swo.bayern/hauptmensa-coburg,
    verified 2026-09-30 (53 vegetarian, 54 vegan, 55–59 meat, 60/62 fish).
    """
    if not isinstance(symbols, str):
        return "unknown"
    labels = {part.strip() for part in symbols.split(",")}
    meat = bool(labels & {"55", "56", "57", "58", "59"})
    fish = bool(labels & {"60", "62"})
    # Conflicting plant/animal markers cannot establish a dietary preference.
    if (labels & {"53", "54"}) and (meat or fish):
        return "unknown"
    if "54" in labels:
        return "unknown" if "65" in labels else "vegan"
    if "53" in labels:
        return "unknown" if "65" in labels else "vegetarian"
    if meat:
        return "meat"
    if fish:
        return "fish"
    return "unknown"


class Menu(BaseModel):
    date: date

    canteen: str

    meals: list[Meal] = Field(max_length=200)

    fetched_at: datetime

    source_url: str

    stale: bool = False


def parse_meals(rows: object, day: date, category: str = "other") -> list[Meal]:

    if not isinstance(rows, list) or len(rows) > 200:
        raise ValueError("Invalid menu response")

    result: list[Meal] = []
    seen: set[tuple[str, str]] = set()

    for row in rows:
        if not isinstance(row, dict) or row.get("prod") != day.strftime("%d.%m.%Y"):
            raise ValueError("Menu date mismatch")

        name = row.get("title")

        if not isinstance(name, str) or not name.strip():
            raise ValueError("Missing meal name")

        identity = (str(row.get("rezeptur_id")), name)

        if identity in seen:
            continue

        seen.add(identity)

        image = row.get("image")
        picture = image_path(image.get("src")) if isinstance(image, dict) else None
        if picture:
            picture = "/api/mensa/image?path=" + quote(picture.replace("s_1600x900", "s_800x450"), safe="")
        result.append(
            Meal(
                name=name,
                student_price=row.get("student"),
                allergens=row.get("allergens") or "",
                dietary=dietary_label(row.get("essenssymbole")),
                category=category,
                image_url=picture,
            )
        )

    return result


class MenuService:
    def __init__(self, repository: MenuRepository):

        self.repository = repository

        self.lock = Lock()

        self.cache = repository.read()

        self.failed: dict[str, datetime] = {}

    def get(self, slug: str, day: date) -> Menu:

        key = f"{slug}:{day.isoformat()}"

        with self.lock:
            now = datetime.now(UTC)

            cached = None

            try:
                cached = Menu.model_validate(self.cache[key])

                if (
                    cached.canteen != slug
                    or cached.date != day
                    or cached.fetched_at.tzinfo is None
                ):
                    cached = None

            except (KeyError, ValueError, ValidationError):
                pass

            labels_present = cached is not None and all(
                all(field in item for field in ("dietary", "category", "image_url")) for item in self.cache[key].get("meals", [])
            )
            if (
                cached
                and labels_present
                and timedelta(0) <= now - cached.fetched_at < timedelta(hours=1)
            ):
                return cached

            if key in self.failed and now - self.failed[key] < timedelta(minutes=5):
                if cached:
                    return cached.model_copy(update={"stale": True})

                raise ValueError(
                    "Speiseplan gerade nicht erreichbar. Bitte später erneut versuchen."
                )

            try:
                meals: list[Meal] = []
                # The provider returns no category on a meal. Preserve its
                # actual category by reading each category sequentially.
                with httpx.Client(timeout=12, follow_redirects=False) as client:
                    for category in CATEGORIES:
                        with client.stream("POST", f"{BASE}/api/meals", json={
                            "date": day.isoformat(), "location_name": slug, "categories": [category],
                        }) as response:
                            response.raise_for_status()
                            raw = bytearray()
                            for chunk in response.iter_bytes():
                                raw.extend(chunk)
                                if len(raw) > 2_000_000:
                                    raise ValueError("Menu response too large")
                        meals.extend(parse_meals(json.loads(raw), day, category))
                        if len(meals) > 200:
                            raise ValueError("Menu response too large")
                menu = Menu(
                    date=day,
                    canteen=slug,
                    meals=meals,
                    fetched_at=now,
                    source_url=f"{BASE}/{slug}#/{day.isoformat()}/student",
                )

            except (httpx.HTTPError, ValueError, ValidationError):
                self.failed[key] = now

                if cached:
                    return cached.model_copy(update={"stale": True})

                raise ValueError(
                    "Speiseplan gerade nicht erreichbar. Bitte später erneut versuchen."
                ) from None

            self.failed.pop(key, None)

            self.cache[key] = menu.model_dump(mode="json")

            # Keep recent public menus only, never credentials or user content.

            self.cache = dict(list(self.cache.items())[-60:])

            try:
                self.repository.save(self.cache)

            except OSError:
                pass  # A read-only/offline device can still show its in-memory menu.

            return menu
