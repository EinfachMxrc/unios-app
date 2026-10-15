# SPDX-License-Identifier: AGPL-3.0-or-later

"""Startpunkt für das tägliche restic-Backup."""

from app.health.backup import main

if __name__ == "__main__":
    raise SystemExit(main())
