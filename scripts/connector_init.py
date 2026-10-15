# SPDX-License-Identifier: AGPL-3.0-or-later
"""Compatibility entry point for the packaged connector generator."""
from app.connectors.scaffold import READ_CAPABILITIES, create_scaffold, main

__all__ = ['READ_CAPABILITIES', 'create_scaffold', 'main']

if __name__ == '__main__':
    main()
