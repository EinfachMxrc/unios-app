# SPDX-License-Identifier: AGPL-3.0-or-later

"""Receive the OS URL callback without printing or persisting its Moodle token."""

import sys
import webbrowser
from urllib.parse import urlsplit

import httpx


def main(arguments: list[str] | None = None) -> int:
    values = sys.argv[1:] if arguments is None else arguments
    if len(values) != 1 or len(values[0]) > 4096:
        return 2
    parsed = urlsplit(values[0])
    if parsed.scheme != "marcunios" or not values[0].startswith("marcunios://token="):
        return 2
    try:
        with httpx.Client(timeout=15, trust_env=False) as client:
            response = client.post("http://127.0.0.1:8000/api/setup/moodle/callback",
                                   json={"callback": values[0]})
            response.raise_for_status()
    except httpx.HTTPError:
        return 1
    webbrowser.open("http://127.0.0.1:8000/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
