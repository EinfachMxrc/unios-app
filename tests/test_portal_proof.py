# SPDX-License-Identifier: AGPL-3.0-or-later

"""Portal proof requests stay GET-only and proof filenames reveal no session URL."""

from types import SimpleNamespace

import pytest

from app.portals.proof import (
    PortalProofError,
    allow_portal_request,
    capture_portal_proof,
    proof_path,
    save_portal_proof,
)
from app.portals.session import validate_session

BASE = "https://portal.example.invalid/"


class FakeRoute:
    def __init__(self, method: str, url: str):
        self.request = SimpleNamespace(method=method, url=url)
        self.action = ""

    def abort(self):
        self.action = "abort"

    def continue_(self):
        self.action = "continue"


def test_browser_guard_blocks_writes_and_foreign_hosts():
    for method, url, expected in [
        ("GET", BASE + "exams", "continue"),
        ("POST", BASE + "exams", "abort"),
        ("GET", "https://other.example.invalid/exams", "abort"),
        ("GET", "http://portal.example.invalid/exams", "abort"),
    ]:
        route = FakeRoute(method, url)
        allow_portal_request(route, BASE)
        assert route.action == expected


def test_proof_file_is_immutable_and_only_valid_ids_are_readable(tmp_path):
    png = b"\x89PNG\r\n\x1a\nfictional-picture"
    proof_id, captured_at = save_portal_proof(tmp_path, png)
    assert captured_at.tzinfo is not None
    path = proof_path(tmp_path, proof_id)
    assert path is not None and path.read_bytes() == png
    assert proof_path(tmp_path, "../private") is None
    assert proof_path(tmp_path, proof_id + "?Session=secret") is None
    with pytest.raises(PortalProofError, match="ungültig"):
        save_portal_proof(tmp_path, b"not a PNG")


def test_wrong_host_is_rejected_before_browser_start():
    stored = validate_session("primuss", BASE, BASE + "start?Session=fictional", {
        "cookies": [], "origins": [],
    })
    with pytest.raises(PortalProofError, match="Nachweisadresse"):
        capture_portal_proof(BASE, "https://other.example.invalid/", stored)
