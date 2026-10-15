# SPDX-License-Identifier: AGPL-3.0-or-later
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.mensa.api import mensa_router
from app.mensa.repository import MenuRepository
from app.mensa.service import (
    CATEGORIES,
    Meal,
    Menu,
    MenuService,
    dietary_label,
    image_path,
    parse_meals,
    read_image,
)


@pytest.mark.parametrize(
    ("symbols", "expected"),
    [
        ("54,63", "vegan"),
        ("53", "vegetarian"),
        ("60,61", "fish"),
        ("62", "fish"),
        ("59", "meat"),
        ("56,52", "meat"),
        (None, "unknown"),
        ("", "unknown"),
        ("52", "unknown"),
        ("54,59", "unknown"),
        ("53,60", "unknown"),
        ("54,65", "unknown"),
    ],
)
def test_explicit_provider_symbols_determine_dietary_label(symbols, expected):
    assert dietary_label(symbols) == expected


def test_meal_names_and_missing_allergens_do_not_establish_a_diet():
    meals = parse_meals(
        [
            {
                "prod": "01.10.2026",
                "rezeptur_id": 1,
                "title": "Vegan klingendes Testgericht",
                "student": 3.5,
                "allergens": "",
            }
        ],
        date(2026, 10, 1),
    )
    assert meals[0].dietary == "unknown"


def test_legacy_cache_refreshes_labels_and_remains_usable_offline(
    tmp_path, monkeypatch
):
    day = datetime.now(UTC).date()
    menu = Menu(
        date=day,
        canteen="test-canteen",
        meals=[Meal(name="Testgericht")],
        fetched_at=datetime.now(UTC),
        source_url="https://sls.swo.bayern/test-canteen",
    )
    legacy = menu.model_dump(mode="json")
    del legacy["meals"][0]["dietary"]
    repo = MenuRepository(tmp_path)
    repo.save({f"test-canteen:{day.isoformat()}": legacy})

    @contextmanager
    def stream(*args, **kwargs):
        yield httpx.Response(
            200,
            json=[
                {
                    "prod": day.strftime("%d.%m.%Y"),
                    "rezeptur_id": 1,
                    "title": "Testgericht",
                    "essenssymbole": "54",
                    "student": 3.5,
                }
            ],
            request=httpx.Request("POST", "https://sls.swo.bayern/api/meals"),
        )

    monkeypatch.setattr(httpx.Client, "stream", stream)
    assert MenuService(repo).get("test-canteen", day).meals[0].dietary == "vegan"
    repo.save({f"test-canteen:{day.isoformat()}": legacy})

    def offline(*args, **kwargs):
        raise httpx.ConnectError("Offline fixture")

    monkeypatch.setattr(httpx.Client, "stream", offline)
    restored = MenuService(repo).get("test-canteen", day)
    assert restored.stale and restored.meals[0].dietary == "unknown"


def test_parser_deduplicates_and_rejects_wrong_date():
    row = {
        "prod": "01.10.2026",
        "rezeptur_id": 1,
        "title": "Testgericht",
        "student": 3.5,
        "allergens": "a1",
    }
    meals = parse_meals([row, row], date(2026, 10, 1))
    assert len(meals) == 1 and meals[0].student_price == 3.5
    assert parse_meals([], date(2026, 10, 1)) == []
    with pytest.raises(ValueError, match="date mismatch"):
        parse_meals([row], date(2026, 10, 2))


def test_public_cache_survives_offline_restart(tmp_path, monkeypatch):
    repo = MenuRepository(tmp_path)
    day = datetime.now(UTC).date()
    menu = Menu(
        date=day,
        canteen="test-canteen",
        meals=[],
        fetched_at=datetime.now(UTC) - timedelta(hours=2),
        source_url="https://sls.swo.bayern/test-canteen",
    )
    repo.save({f"test-canteen:{day.isoformat()}": menu.model_dump(mode="json")})
    calls = []

    def unavailable(*args, **kwargs):
        calls.append(1)
        raise httpx.ConnectError("Offline fixture")

    monkeypatch.setattr(httpx.Client, "stream", unavailable)
    service = MenuService(repo)
    assert service.get("test-canteen", day).stale
    assert service.get("test-canteen", day).stale
    assert len(calls) == 1  # Backoff prevents repeated network requests.
    assert MenuService(repo).get("test-canteen", day).stale


def test_profile_services_and_unknown_canteen_rejected(settings):
    settings.institution_slug = "hs-coburg"
    app = FastAPI()
    app.include_router(mensa_router(settings))
    client = TestClient(app)
    config = client.get("/api/mensa/services").json()
    assert config["mail_url"] == "https://outlook.office.com/"
    assert len(config["canteens"]) == 2
    assert client.get("/api/mensa/plan?canteen=http://localhost").status_code == 422
    settings.institution_slug = "generic"
    assert client.get("/api/mensa/services").json()["canteens"] == []


def test_categories_and_provider_photos_are_preserved(tmp_path, monkeypatch):
    day = date(2026, 10, 2)
    categories = []
    @contextmanager
    def stream(self, method, url, **kwargs):
        category = kwargs["json"]["categories"][0]
        categories.append(category)
        yield httpx.Response(200, json=[{
            "prod": "02.10.2026", "rezeptur_id": len(categories),
            "title": f"Test-{category}", "student": 2.5, "essenssymbole": "54",
            "image": {"src": "/_ipx/f_webp,s_1600x900/meals/42.jpg?m=123"},
        }], request=httpx.Request(method, url))
    monkeypatch.setattr(httpx.Client, "stream", stream)
    menu = MenuService(MenuRepository(tmp_path)).get("test-canteen", day)
    assert categories == CATEGORIES
    assert [meal.category for meal in menu.meals] == CATEGORIES
    assert all(meal.image_url and "s_800x450" in meal.image_url for meal in menu.meals)
    assert menu.meals[2].category == "side"


@pytest.mark.parametrize("value", ["https://evil.test/meals/1.jpg", "//evil.test/meals/1.jpg", "/meals/../1.jpg", "/meals/1.svg", "/meals/1.jpg?redirect=evil", "/%2e%2e/meals/1.jpg"])
def test_meal_photo_cannot_fetch_arbitrary_hosts_or_paths(value):
    assert image_path(value) is None
    with pytest.raises(ValueError):
        read_image(value)


def test_photo_proxy_only_accepts_bounded_image_responses(monkeypatch):
    response = httpx.Response(200, content=b"fixture-image", headers={"content-type": "image/webp"}, request=httpx.Request("GET", "https://sls.swo.bayern/meals/42.jpg"))
    @contextmanager
    def stream(self, method, url, **kwargs):
        assert method == "GET" and url == "https://sls.swo.bayern/meals/42.jpg"
        yield response
    monkeypatch.setattr(httpx.Client, "stream", stream)
    assert read_image("/meals/42.jpg") == (b"fixture-image", "image/webp")
    response = httpx.Response(200, content=b"<html>", headers={"content-type": "text/html"}, request=httpx.Request("GET", "https://sls.swo.bayern/meals/42.jpg"))
    with pytest.raises(ValueError):
        read_image("/meals/42.jpg")
    response = httpx.Response(200, content=b"x" * 4_000_001, headers={"content-type": "image/png"}, request=httpx.Request("GET", "https://sls.swo.bayern/meals/42.jpg"))
    with pytest.raises(ValueError):
        read_image("/meals/42.jpg")
