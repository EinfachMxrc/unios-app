# SPDX-License-Identifier: AGPL-3.0-or-later

"""Validate the publishable connector catalog and optional upgrade baseline."""

import argparse
from pathlib import Path

from app.connectors.registry_validation import validate_registry, validate_upgrade


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--previous", type=Path, help="Registry JSON from the prior release")
    args = parser.parse_args()
    errors = validate_registry()
    if args.previous:
        errors.extend(validate_upgrade(args.previous))
    for error in errors:
        print(error)
    if not errors:
        print("Connector-Registry und Hochschulprofile gültig")
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
