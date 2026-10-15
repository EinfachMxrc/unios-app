# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep browser-assisted PRIMUSS navigation limited to a reviewed menu form."""

from dataclasses import dataclass

import pytest

pytest.importorskip("playwright")

from clients.login_helper.browser_discovery import MenuRequestGuard


@dataclass
class FakeRequest:
    method: str
    url: str
    post_data: str | None = None
    headers: dict[str, str] | None = None

    def __post_init__(self) -> None:
        if self.headers is None:
            self.headers = {"content-type": "application/x-www-form-urlencoded"}


class FakeRoute:
    def __init__(self, request: FakeRequest) -> None:
        self.request = request
        self.result = ""

    def continue_(self) -> None:
        self.result = "allowed"

    def abort(self) -> None:
        self.result = "blocked"


def test_only_one_exact_menu_post_can_pass() -> None:
    guard = MenuRequestGuard("https://www3.primuss.de/")
    target = "https://www3.primuss.de/cgi-bin/sesam/index.pl"
    menu = "FH=Coburg&Language=de&Nav=Pruefungen&Portal=1&Session=token&User=student"
    guard.menu_budget = 1

    first = FakeRoute(FakeRequest("POST", target, menu))
    guard.route(first)  # type: ignore[arg-type]
    second = FakeRoute(FakeRequest("POST", target, menu))
    guard.route(second)  # type: ignore[arg-type]
    mutation = FakeRoute(FakeRequest("POST", target, menu + "&Action=register"))
    guard.menu_budget = 1
    guard.route(mutation)  # type: ignore[arg-type]
    get = FakeRoute(FakeRequest("GET", target))
    guard.route(get)  # type: ignore[arg-type]

    assert [first.result, second.result, mutation.result, get.result] == [
        "allowed", "blocked", "blocked", "allowed",
    ]
